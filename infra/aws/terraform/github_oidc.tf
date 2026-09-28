# ------------------------------------------------------------------------------
# GitHub Actions OIDC — lets .github/workflows/deploy-aws.yml assume an AWS
# IAM role directly from a GitHub-hosted runner with NO long-lived AWS
# access key stored as a GitHub secret at all. GitHub issues a short-lived
# OIDC token scoped to (among other things) the exact repo + branch that
# triggered the workflow; AWS's identity provider trust policy below only
# allows that role to be assumed by a token asserting
# `repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}`
# — a workflow run from a fork, a different branch, or a different repo
# cannot assume this role, even with a copy of this same workflow file.
# ------------------------------------------------------------------------------

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${local.name_prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  # Short session duration — this role is only ever assumed for the
  # duration of a single deploy workflow run.
  max_session_duration = 3600
}

# Scoped tightly to exactly what deploy-aws.yml needs to do: push an image
# to this one ECR repo, register/describe/update this one ECS
# service/cluster, run the one-off migrate task, and read the two log
# groups for its own visibility. Deliberately NOT `AdministratorAccess` or
# any other broad managed policy.
data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  statement {
    sid = "EcsDeploy"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:UpdateService",
      "ecs:RunTask",
    ]
    resources = ["*"] # ecs:RegisterTaskDefinition does not support resource-level restriction; access is bounded by the trust policy above (only this repo/branch) instead
  }

  statement {
    sid       = "PassRolesToEcsTasks"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]
  }

  statement {
    sid       = "ReadLogsForDeployVisibility"
    actions   = ["logs:GetLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*", "${aws_cloudwatch_log_group.migrate.arn}:*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${local.name_prefix}-github-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
