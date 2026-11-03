# platform-lab

A small service that covers the platform side of running an app. It has a Fastify API, a PostgreSQL database, and a worker that processes jobs from a queue stored in the database. The same app is deployed to AWS with Terraform, runs on Kubernetes through plain manifests and a Helm chart, and is monitored with Prometheus and Grafana.

## What is in it

- src/app.ts: the API. GET /health (liveness), GET /ready (readiness, checks the database), POST /jobs, GET /jobs, GET /metrics (Prometheus).
- src/metrics.ts: a request duration histogram labelled by method, route pattern and status code, plus default process metrics.
- src/worker.ts: a worker that claims queued jobs and marks them done. It uses SELECT ... FOR UPDATE SKIP LOCKED so several workers never take the same job.
- Dockerfile: three stages (build, production dependencies, runtime). The final image runs as a non root user and has a health check.
- docker-compose.yml: PostgreSQL, the API, and the worker, with a database health check so the app starts only when the database is ready.
- .github/workflows/ci.yml: typecheck and test on every push and pull request, then build and push an image to GitHub's container registry from main.
- .github/workflows/kubernetes.yml: lints the Helm chart, starts a throwaway kind cluster in the runner, installs the chart, runs the smoke test, then upgrades and rolls back the release.
- .github/workflows/terraform.yml: format, validate and plan on every pull request, logging in to AWS through GitHub OIDC with a read only role.
- k8s: plain manifests for a local kind cluster. helm/platform-lab: the same thing as a Helm chart. monitoring: values for Prometheus and Grafana.
- scripts/smoke-test.sh: creates a job and waits until a worker finishes it. Works against any running copy of the API.

## Run it

    npm install
    npm test
    docker compose up --build

Then, in another terminal:

    curl localhost:3000/health
    curl localhost:3000/ready
    curl -X POST localhost:3000/jobs -H 'content-type: application/json' -d '{"task":"resize"}'
    curl localhost:3000/jobs

Watch the worker pick the job up in the compose logs and the status change from queued to done.

## Design decisions

- **Liveness and readiness are separate.** `/health` only says the process is up, so Kubernetes restarts the pod when it fails. `/ready` also checks the database, so a pod without a database is taken out of the Service but not restarted.
- **The Dockerfile copies `package.json` before the source.** The dependency layer is cached and only rebuilds when dependencies change.
- **The image runs as a non root user.** A compromised process gets no privileges on the container or a mounted volume.
- **`SELECT ... FOR UPDATE SKIP LOCKED` in the worker.** Several workers can claim jobs at once and none takes a job another one already holds.
- **Graceful shutdown.** On SIGTERM the API stops accepting connections and finishes in flight requests, and the worker finishes its current job, so a rollout drops nothing.

## Infrastructure (Terraform)

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

## Infrastructure notes

- Only your own IP can reach the app on port 3000. The database accepts connections only from the app's security group.
- No SSH port is open. Use AWS Systems Manager Session Manager.
- The server requires IMDSv2.
- The database connection uses sslmode=no-verify, which encrypts the traffic but does not verify the certificate. Tightening that means adding the RDS certificate bundle to the image.
- Terraform state lives in an S3 bucket with locking, so CI and a laptop share one state.

## Kubernetes (kind)

The k8s folder runs the whole stack on a local kind cluster: a Postgres StatefulSet with a persistent volume, an API Deployment, a worker Deployment, and an optional autoscaler.

    kind create cluster --name lab
    docker build -t platform-lab:dev .
    kind load docker-image platform-lab:dev --name lab
    kubectl apply -f k8s/namespace.yaml
    sh k8s/create-secrets.sh
    kubectl apply -f k8s/postgres.yaml -f k8s/api.yaml -f k8s/worker.yaml
    kubectl -n lab port-forward svc/api 8080:80
    scripts/smoke-test.sh

The database password is generated by create-secrets.sh and never stored in git. The API pods run as a non root user with a read only filesystem and no extra capabilities. Liveness checks /health and readiness checks /ready, so a pod without a database is taken out of the Service but not restarted. The rolling update uses maxUnavailable 0 and maxSurge 1, with a short preStop sleep and the SIGTERM handler, so a rollout drops no requests.

The autoscaler (k8s/api-hpa.yaml) needs metrics-server. On kind that means installing it and adding the --kubelet-insecure-tls flag, which is fine locally and not something to copy to production.

## Failure testing

- Deleting an API pod: the ReplicaSet creates a replacement, because it keeps comparing the desired number of pods with the actual number.
- Scaling Postgres to zero, first attempt: the API pods crashed and went into CrashLoopBackOff. The pool had no error handler, and the startup code threw because the database name no longer resolved. The fix was a pool error handler, a startup retry, and a worker loop that survives failed claims. On the second attempt the pods stayed Running but not ready, with zero restarts, and recovered by themselves when the database came back. The data survived because it lives on a persistent volume, not in the pod.
- Restarting the API while a client in the cluster called the Service several times a second: only 200 responses, and at most three pods at once.
- Load with eight parallel clients: the autoscaler went from 2 to 6 API pods. It also showed the limits of autoscaling: it needs time to measure and start pods, it cannot pass the maximum, and every pod shares one Postgres.

## Helm

helm/platform-lab holds the same stack as a chart. Values control the image, replica counts, resources, autoscaling, and whether Postgres runs in the cluster. The API Deployment leaves out replicas when the autoscaler is on, so an upgrade does not reset it. The database secret is created outside the chart, so the password never ends up in the release history.

    kubectl create namespace lab-helm
    sh k8s/create-secrets.sh lab-helm
    helm install platform helm/platform-lab -n lab-helm
    helm upgrade platform helm/platform-lab -n lab-helm --set worker.replicas=5
    helm rollback platform 1 -n lab-helm

A rollback creates a new revision copied from the old one, so the history only grows.

## Monitoring

monitoring/values.yaml is a small configuration of the kube-prometheus-stack chart for a kind cluster. The chart includes a ServiceMonitor that makes Prometheus scrape the API's /metrics. It carries the label release: monitoring, because the stack ignores monitors without it.

    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f monitoring/values.yaml
    kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80

Open http://localhost:3001 (admin and admin, local only). Some queries to try in Explore:

    sum(rate(http_request_duration_seconds_count{namespace="lab-helm"}[1m])) by (route)
    histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="lab-helm"}[1m])) by (le, route))
    sum(rate(http_request_duration_seconds_count{namespace="lab-helm", status_code=~"5.."}[1m]))

Labels use the route pattern, never the raw URL, so the number of time series stays small.
