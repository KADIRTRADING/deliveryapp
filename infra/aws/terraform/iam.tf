# ------------------------------------------------------------------------------
# IAM — two distinct ECS roles, per AWS's standard (and important) split:
#
# - Execution role: used by the ECS agent itself BEFORE your container
#   starts, to pull the image from ECR and fetch secrets from Secrets
#   Manager to inject as environment variables.
# - Task role: assumed BY YOUR APPLICATION CODE at runtime (this is what
#   makes the S3StorageProvider's default AWS SDK credential chain resolve
#   to real, scoped, auto-rotating credentials — see the comment in
#   src/modules/storage/storage-provider.ts). Grants only S3 access to the
#   media bucket; nothing else.
# ------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The managed policy above covers ECR pull + basic CloudWatch Logs, but NOT
# reading from Secrets Manager — that needs an explicit, scoped grant to
# only this app's one secret (never `secretsmanager:GetSecretValue` on `*`).
data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "${local.name_prefix}-ecs-execution-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

data "aws_iam_policy_document" "ecs_task_s3_media" {
  statement {
    sid = "MediaBucketReadWrite"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.media.arn}/*"]
  }

  statement {
    sid       = "MediaBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }
}

resource "aws_iam_role_policy" "ecs_task_s3_media" {
  name   = "${local.name_prefix}-ecs-task-s3-media"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_s3_media.json
}
