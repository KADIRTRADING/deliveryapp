output "app_url" {
  description = "Public URL the app is reachable at."
  value       = local.app_public_url
}

output "app_cloudfront_domain" {
  description = "The *.cloudfront.net domain for the app distribution (usable even before/without a custom domain)."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "media_cloudfront_domain" {
  description = "The *.cloudfront.net domain that serves uploaded restaurant/product images."
  value       = aws_cloudfront_distribution.media.domain_name
}

output "ecr_repository_url" {
  description = "Push Docker images here — used by .github/workflows/deploy-aws.yml."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecs_app_task_definition_family" {
  value = aws_ecs_task_definition.app.family
}

output "ecs_migrate_task_definition_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "private_subnet_ids" {
  description = "Needed for `aws ecs run-task` invocations (the migrate task runs in these subnets)."
  value       = aws_subnet.private[*].id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "db_endpoint" {
  description = "RDS endpoint (host:port) — for reference/debugging only. The app itself receives the full connection string via Secrets Manager, never this output."
  value       = aws_db_instance.main.endpoint
}

output "secrets_manager_secret_arn" {
  description = "Where DATABASE_URL/REDIS_URL/provider credentials live. Use `aws secretsmanager put-secret-value` (or re-apply Terraform with new -var values) to rotate any of them."
  value       = aws_secretsmanager_secret.app.arn
}

output "github_actions_deploy_role_arn" {
  description = "Set this as the `role-to-assume` input in .github/workflows/deploy-aws.yml (already done in this repo — shown here for reference/verification)."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.bucket
}
