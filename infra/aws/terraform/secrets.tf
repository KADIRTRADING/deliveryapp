# ------------------------------------------------------------------------------
# Secrets Manager — every credential the running app needs (DB connection
# string, Redis URL, and optional real Payme/Click/Mapbox/Eskiz provider
# credentials) is stored here and injected into the ECS task via the task
# definition's `secrets` block (see ecs.tf), NOT as plaintext environment
# variables. This means:
#   - Provider credentials never appear in `terraform plan`/`apply` console
#     output for the *task definition* resource (only this secret's ARN
#     does), never in the ECS console's "environment variables" tab, and
#     never in a CloudWatch Logs line that happens to dump process.env.
#   - Rotating a credential (e.g. after a Payme secret rotation) means
#     updating the secret value and forcing a new ECS deployment — it does
#     NOT require a `terraform apply` or a new Docker image.
#
# The values below still exist as Terraform variables (so `terraform apply`
# can set them) and are marked `sensitive = true`, which redacts them from
# CLI output — but they ARE stored in Terraform state in plaintext, as is
# fundamentally true of every Terraform-managed secret. Treat the state
# backend (see versions.tf's comment on remote state) as sensitive
# infrastructure: encrypt it at rest, restrict who can read it, and never
# commit a `terraform.tfstate` file to git (already covered by
# infra/aws/terraform/.gitignore).
# ------------------------------------------------------------------------------

variable "payme_merchant_id" {
  description = "Payme merchant ID. Leave empty to keep PAYMENT_DEFAULT_PROVIDER=mock (no real charges)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payme_secret_key" {
  description = "Payme merchant secret key. Leave empty to keep PAYMENT_DEFAULT_PROVIDER=mock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "click_merchant_id" {
  description = "Click merchant ID. Leave empty to keep PAYMENT_DEFAULT_PROVIDER=mock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "click_service_id" {
  description = "Click service ID. Leave empty to keep PAYMENT_DEFAULT_PROVIDER=mock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "click_secret_key" {
  description = "Click merchant secret key. Leave empty to keep PAYMENT_DEFAULT_PROVIDER=mock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "mapbox_server_token" {
  description = "Mapbox secret server token (sk.*) for real geocoding. Leave empty to keep MAP_PROVIDER=mock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "eskiz_email" {
  description = "Eskiz.uz account email, for real SMS delivery. Leave empty to keep SMS_PROVIDER=console (OTPs are logged, not sent)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "eskiz_password" {
  description = "Eskiz.uz account password. Leave empty to keep SMS_PROVIDER=console."
  type        = string
  default     = ""
  sensitive   = true
}

variable "payment_default_provider" {
  description = "Which PaymentProvider the app should use by default (\"mock\", \"payme\", or \"click\"). Should stay \"mock\" until real Payme/Click credentials above are set — the app fails fast at startup in production if a non-mock provider is selected without its required credentials (see src/lib/env.ts's assertProductionCredentials)."
  type        = string
  default     = "mock"

  validation {
    condition     = contains(["mock", "payme", "click"], var.payment_default_provider)
    error_message = "payment_default_provider must be one of: mock, payme, click."
  }
}

variable "map_provider" {
  description = "Which MapProvider the app should use (\"mock\" or \"mapbox\")."
  type        = string
  default     = "mock"

  validation {
    condition     = contains(["mock", "mapbox"], var.map_provider)
    error_message = "map_provider must be one of: mock, mapbox."
  }
}

variable "sms_provider" {
  description = "Which SmsProvider the app should use (\"console\" or \"eskiz\")."
  type        = string
  default     = "console"

  validation {
    condition     = contains(["console", "eskiz"], var.sms_provider)
    error_message = "sms_provider must be one of: console, eskiz."
  }
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name_prefix}/app"
  description             = "DeliveryApp runtime secrets (DB/Redis connection strings, payment/map/SMS provider credentials)."
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-secrets" }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.main.address}:5432/${var.db_name}?schema=public"
    REDIS_URL    = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"

    PAYME_MERCHANT_ID = var.payme_merchant_id
    PAYME_SECRET_KEY  = var.payme_secret_key
    CLICK_MERCHANT_ID = var.click_merchant_id
    CLICK_SERVICE_ID  = var.click_service_id
    CLICK_SECRET_KEY  = var.click_secret_key

    MAPBOX_SERVER_TOKEN = var.mapbox_server_token

    ESKIZ_EMAIL    = var.eskiz_email
    ESKIZ_PASSWORD = var.eskiz_password
  })
}
