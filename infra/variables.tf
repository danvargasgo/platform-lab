variable "region" {
  type    = string
  default = "us-east-1"
}

variable "my_ip" {
  type        = string
  description = "Your public IPv4 address, without a mask. Only this address can reach the app on port 3000."
}

variable "running" {
  type        = bool
  default     = false
  description = "When true, the database and the app server exist and bill by the hour. When false they are destroyed."
}

variable "image_tag" {
  type    = string
  default = "v1"
}

variable "github_owner" {
  type    = string
  default = "danvargasgo"
}

variable "github_owner_id" {
  type    = string
  default = "55603131"
}

variable "github_repo_name" {
  type    = string
  default = "platform-lab"
}

variable "github_repo_id" {
  type    = string
  default = "1423603442"
}
