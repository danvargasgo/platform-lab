import {
  to = aws_ecr_repository.app
  id = "platform-lab"
}

resource "aws_ecr_repository" "app" {
  name                 = "platform-lab"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
