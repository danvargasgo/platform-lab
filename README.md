platform-lab

A small service built to practice platform engineering. It has a Fastify API, a PostgreSQL database, and a worker that processes jobs from a queue stored in the database. Over the next weeks the same app gets deployed to AWS with Terraform, then to Kubernetes, then monitored with Prometheus and Grafana.

What is in it

- src/app.ts: the API. GET /health (liveness), GET /ready (readiness, checks the database), POST /jobs, GET /jobs.
- src/worker.ts: a worker that claims queued jobs and marks them done. It uses SELECT ... FOR UPDATE SKIP LOCKED so several workers never take the same job.
- Dockerfile: three stages (build, production dependencies, runtime). The final image runs as a non root user and has a health check.
- docker-compose.yml: PostgreSQL, the API, and the worker, with a database health check so the app starts only when the database is ready.
- .github/workflows/ci.yml: typecheck and test on every push and pull request, then build and push an image to GitHub's container registry from main.

Run it

    npm install
    npm test
    docker compose up --build

Then, in another terminal:

    curl localhost:3000/health
    curl localhost:3000/ready
    curl -X POST localhost:3000/jobs -H 'content-type: application/json' -d '{"task":"resize"}'
    curl localhost:3000/jobs

Watch the worker pick the job up in the compose logs and the status change from queued to done.

Weeks 1 and 2 checklist

- [x] Install Docker Desktop (or OrbStack or Colima) and get `docker compose up --build` working.
- [x] Create a job and watch the worker process it. Run `docker compose up --scale worker=3` and confirm no job is processed twice.
- [x] Stop the database container and call /ready. Then call /health. Explain why they differ.
- [x] Compare image sizes: `docker images`. Remove the multistage build temporarily and see how much bigger the image gets.
- [x] Prove the container does not run as root: `docker compose exec api id`.
- [x] Press Ctrl+C on compose and read the logs. Confirm the API and worker shut down cleanly on SIGTERM.
- [ ] Push to GitHub and get the CI pipeline green. Find the image under Packages.
- [ ] Break a test on purpose in a pull request and see CI fail. Fix it.

Questions to answer in your own words (these are interview questions)

1. What is the difference between a liveness and a readiness check, and what does Kubernetes do with each?
2. Why does the Dockerfile copy package.json before the source code?
3. Why run as a non root user?
4. What does SKIP LOCKED solve?
5. What happens to in flight requests when a container gets SIGTERM?

Infrastructure (Terraform)

The infra folder defines the AWS side in Terraform: security groups, an IAM role and instance profile, the container registry, and, when switched on, a private RDS PostgreSQL database (password managed by AWS Secrets Manager) and a server that runs the image from the registry.

A variable called running is the on/off switch for everything that bills by the hour. It defaults to false.

    cd infra
    export AWS_PROFILE=lab AWS_REGION=us-east-1
    export TF_VAR_my_ip=$(curl -s https://checkip.amazonaws.com)
    terraform plan -var running=true -out=tfplan
    terraform apply tfplan
    curl $(terraform output -raw app_url)/ready

    terraform apply -var running=false

The last command destroys only the database and the server. Push the image to the registry first (docker buildx build --platform linux/amd64 ... --push) or the server will boot with nothing to run.

Notes

- Only your own IP can reach the app on port 3000. The database accepts connections only from the app's security group.
- No SSH port is open. Use AWS Systems Manager Session Manager.
- The server requires IMDSv2.
- The database connection uses sslmode=no-verify, which encrypts the traffic but does not verify the certificate. Tightening that means adding the RDS certificate bundle to the image.
