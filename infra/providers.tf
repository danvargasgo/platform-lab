provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "platform-lab"
      ManagedBy = "terraform"
    }
  }
}
