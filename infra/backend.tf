terraform {
  backend "s3" {
    bucket       = "platform-lab-tfstate-460060050254"
    key          = "platform-lab/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
