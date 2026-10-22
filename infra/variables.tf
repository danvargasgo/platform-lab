variable "region" {
  type    = string
  default = "us-east-1"
}

variable "profile" {
  type    = string
  default = "lab"
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
