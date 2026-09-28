# ------------------------------------------------------------------------------
# ECR — holds the production Docker image built by .github/workflows/deploy-aws.yml
# ------------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = "${var.project_name}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${local.name_prefix}-ecr" }
}

# Keep the repository from growing unbounded — retain the most recent 20
# images (roughly 20 deploys of history, enough to roll back several
# releases) and expire the rest.
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}
