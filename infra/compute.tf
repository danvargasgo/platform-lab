data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

data "aws_subnet" "app" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "${var.region}a"
  default_for_az    = true
}

resource "aws_instance" "app" {
  count = var.running ? 1 : 0

  ami                         = data.aws_ami.al2023.id
  instance_type               = "t3.micro"
  subnet_id                   = data.aws_subnet.app.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.app.name
  associate_public_ip_address = true

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("${path.module}/userdata.sh.tftpl", {
    region        = var.region
    registry_host = split("/", aws_ecr_repository.app.repository_url)[0]
    image         = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    secret_arn    = aws_db_instance.app[0].master_user_secret[0].secret_arn
    db_host       = aws_db_instance.app[0].address
  })
  user_data_replace_on_change = true

  depends_on = [
    aws_iam_role_policy.read_db_secret,
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.ecr_read,
  ]

  tags = {
    Name = "lab-app"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
