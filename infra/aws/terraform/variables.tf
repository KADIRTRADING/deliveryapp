variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name, used in resource names/tags (e.g. \"production\", \"staging\")."
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Short name used as a prefix for all resource names."
  type        = string
  default     = "deliveryapp"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to spread public/private subnets across (2 is the minimum for an ALB and safe for an RDS Multi-AZ upgrade later)."
  type        = number
  default     = 2
}

variable "app_image_tag" {
  description = "Docker image tag (in ECR) to deploy for the app service. The deploy-aws.yml workflow overrides this per deploy via -var; the default here is only used for the very first `terraform apply` before any image has been pushed."
  type        = string
  default     = "bootstrap"
}

variable "app_port" {
  description = "Port the Next.js server listens on inside the container."
  type        = number
  default     = 3000
}

variable "app_cpu" {
  description = "Fargate task vCPU units (256 = 0.25 vCPU). 512 is a reasonable small-production starting point for a Next.js server; scale up if p95 latency or CPU utilization run high."
  type        = number
  default     = 512
}

variable "app_memory" {
  description = "Fargate task memory in MiB. Must be a value valid for the chosen app_cpu per AWS Fargate's CPU/memory combinations."
  type        = number
  default     = 1024
}

variable "app_desired_count" {
  description = "Number of running app tasks. 2 is the minimum for zero-downtime rolling deploys and to survive a single task/AZ failure."
  type        = number
  default     = 2
}

variable "app_min_count" {
  description = "Lower bound for the ECS service's autoscaling policy."
  type        = number
  default     = 2
}

variable "app_max_count" {
  description = "Upper bound for the ECS service's autoscaling policy."
  type        = number
  default     = 6
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is Free-Tier eligible for 12 months on a new AWS account and sufficient for low/moderate traffic."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  description = "RDS allocated storage in GB (gp3)."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "PostgreSQL database name."
  type        = string
  default     = "deliveryapp"
}

variable "db_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "deliveryapp"
}

variable "db_multi_az" {
  description = "Whether to run RDS Multi-AZ (roughly doubles RDS cost; recommended once real traffic depends on this — left false by default to stay Free-Tier-friendly on first deploy)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated RDS backup retention period, in days."
  type        = number
  default     = 7
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type. cache.t4g.micro is the smallest current-generation ARM node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "domain_name" {
  description = "Optional custom domain (e.g. \"delivery.example.com\") to serve the app on via CloudFront + ACM. Leave empty to use the CloudFront-assigned *.cloudfront.net domain instead (fully functional over HTTPS with no domain purchase required)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate (in us-east-1, required for CloudFront) covering var.domain_name. Required only if var.domain_name is set. See docs/AWS_DEPLOYMENT.md for how to request one."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub \"owner/repo\" slug allowed to assume the CI/CD deploy role via OIDC (e.g. \"KADIRTRADING/deliveryapp\")."
  type        = string
}

variable "github_deploy_branch" {
  description = "Git branch allowed to assume the CI/CD deploy role (deploys should only ever be triggered from this branch)."
  type        = string
  default     = "main"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention period for the app's container logs."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Optional email address to subscribe to the SNS topic used for CloudWatch alarms (ECS task failures, high 5xx rate, RDS storage). Leave empty to skip creating an email subscription (the SNS topic and alarms are still created either way)."
  type        = string
  default     = ""
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT Gateway (~$32/month + data) so the private subnets (ECS tasks, RDS, Redis) have outbound internet access, needed for pulling npm-registry-hosted content at runtime (there is none at runtime — only at build time inside the Docker image) and, more importantly, for the app to reach external providers like Payme/Click/Mapbox/Eskiz. Set to false only if you are certain no runtime code path ever makes an outbound call to the public internet (not recommended once PAYMENT_DEFAULT_PROVIDER is not \"mock\")."
  type        = bool
  default     = true
}
