output "app_url" {
  value = var.running ? "http://${one(aws_instance.app[*].public_ip)}:3000" : null
}

output "db_endpoint" {
  value = var.running ? aws_db_instance.app[0].address : null
}
