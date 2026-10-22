resource "aws_db_instance" "app" {
  count = var.running ? 1 : 0

  identifier        = "lab-db"
  engine            = "postgres"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  db_name           = "lab"
  username          = "lab"

  # RDS generates the password and keeps it in Secrets Manager.
  # It never appears in this code or in the Terraform state.
  manage_master_user_password = true

  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  storage_encrypted       = true
  backup_retention_period = 0
  multi_az                = false
  skip_final_snapshot     = true
}

resource "aws_iam_role_policy" "read_db_secret" {
  count = var.running ? 1 : 0

  name = "read-db-secret"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = aws_db_instance.app[0].master_user_secret[0].secret_arn
    }]
  })
}
