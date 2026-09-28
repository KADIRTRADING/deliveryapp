# ------------------------------------------------------------------------------
# ECS Fargate — runs the app container. No EC2 instances to patch/manage.
#
# Two task definitions share the same image and most of the same
# environment: `app` (the long-running web server, behind the ALB) and
# `migrate` (a one-off task that runs `npx prisma migrate deploy` and exits
# — invoked manually or by .github/workflows/deploy-aws.yml before each
# deploy, never as part of the app's own startup command, so a bad
# migration fails loudly in its own task instead of crash-looping the whole
# service).
# ------------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}/app"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/ecs/${local.name_prefix}/migrate"
  retention_in_days = var.log_retention_days
}

locals {
  ecr_image = "${aws_ecr_repository.app.repository_url}:${var.app_image_tag}"

  # The `migrate` task (and the ad-hoc `seed` task registered by
  # scripts/aws/seed.sh) need the Prisma CLI and devDependencies
  # (`tsx`, for `npm run db:seed`), which the minimal `production` image
  # deliberately excludes — see the Dockerfile's `migrator` stage comment.
  # deploy-aws.yml builds and pushes both targets, tagged
  # "<tag>" (production) and "<tag>-migrator" (migrator), from the same
  # commit, so they always correspond to the exact same application code.
  ecr_migrator_image = "${aws_ecr_repository.app.repository_url}:${var.app_image_tag}-migrator"

  # Secrets injected from Secrets Manager (never plaintext task-definition
  # env vars) — see secrets.tf for what populates each JSON key.
  app_secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
    { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::" },
    { name = "PAYME_MERCHANT_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:PAYME_MERCHANT_ID::" },
    { name = "PAYME_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:PAYME_SECRET_KEY::" },
    { name = "CLICK_MERCHANT_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:CLICK_MERCHANT_ID::" },
    { name = "CLICK_SERVICE_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:CLICK_SERVICE_ID::" },
    { name = "CLICK_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:CLICK_SECRET_KEY::" },
    { name = "MAPBOX_SERVER_TOKEN", valueFrom = "${aws_secretsmanager_secret.app.arn}:MAPBOX_SERVER_TOKEN::" },
    { name = "ESKIZ_EMAIL", valueFrom = "${aws_secretsmanager_secret.app.arn}:ESKIZ_EMAIL::" },
    { name = "ESKIZ_PASSWORD", valueFrom = "${aws_secretsmanager_secret.app.arn}:ESKIZ_PASSWORD::" },
  ]

  # Plaintext env vars — nothing here is a credential. Real credentials
  # always come from local.app_secrets above instead.
  app_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "APP_URL", value = local.app_public_url },
    { name = "PORT", value = tostring(var.app_port) },
    { name = "SESSION_COOKIE_NAME", value = "dapp_session" },
    { name = "CSRF_COOKIE_NAME", value = "dapp_csrf" },
    { name = "FORCE_SECURE_COOKIES", value = "true" },
    { name = "STORAGE_PROVIDER", value = "s3" },
    { name = "S3_REGION", value = var.aws_region },
    { name = "S3_BUCKET", value = aws_s3_bucket.media.bucket },
    { name = "S3_PUBLIC_BASE_URL", value = "https://${aws_cloudfront_distribution.media.domain_name}" },
    { name = "S3_FORCE_PATH_STYLE", value = "false" },
    { name = "MAP_PROVIDER", value = var.map_provider },
    { name = "PAYMENT_DEFAULT_PROVIDER", value = var.payment_default_provider },
    { name = "SMS_PROVIDER", value = var.sms_provider },
  ]
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = local.ecr_image
      essential = true

      portMappings = [
        { containerPort = var.app_port, protocol = "tcp" }
      ]

      environment = local.app_environment
      secrets     = local.app_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.app_port}/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = { Name = "${local.name_prefix}-app-task" }
}

# One-off migration task — same image/secrets/network as `app`, but
# overrides the container command to run `prisma migrate deploy` and exit,
# and is never registered behind the ALB target group. Invoked via
# `aws ecs run-task` (see scripts/aws/migrate.sh and deploy-aws.yml).
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name_prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = local.ecr_migrator_image
      essential = true
      command   = ["npx", "prisma", "migrate", "deploy"]

      environment = [
        { name = "NODE_ENV", value = "production" },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.migrate.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "migrate"
        }
      }
    }
  ])

  tags = { Name = "${local.name_prefix}-migrate-task" }
}

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name    = "app"
    container_port    = var.app_port
  }

  # Give the app time to pass its first health check before the deployment
  # circuit breaker considers a rollout stuck.
  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # The desired image tag is set by CI (deploy-aws.yml passes
  # -var app_image_tag=<sha>); Terraform should not fight a deploy that
  # happened via `aws ecs update-service` directly (e.g. a manual rollback)
  # by reverting task_definition on the next unrelated `apply`. If you want
  # Terraform to be the sole source of truth for deploys, remove this
  # lifecycle block.
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener_rule.from_cloudfront_only]

  tags = { Name = "${local.name_prefix}-app-service" }
}

# ------------------------------------------------------------------------------
# Autoscaling — scale the app service on CPU utilization. Memory-based
# scaling is not added by default since this workload is far more likely to
# be CPU-bound (SSR rendering, JSON serialization) than memory-bound; add an
# aws_appautoscaling_policy on ECSServiceAverageMemoryUtilization the same
# way below if profiling shows otherwise.
# ------------------------------------------------------------------------------

resource "aws_appautoscaling_target" "app" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.app_min_count
  max_capacity       = var.app_max_count
}

resource "aws_appautoscaling_policy" "app_cpu" {
  name               = "${local.name_prefix}-app-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
