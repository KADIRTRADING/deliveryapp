terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state is intentionally NOT configured here (no S3 backend bucket
  # exists yet on a fresh AWS account, and creating one from inside this
  # same configuration is a bootstrapping chicken-and-egg problem). See
  # docs/AWS_DEPLOYMENT.md step 2 for how to create a backend bucket/
  # DynamoDB lock table once, then uncomment a `backend "s3" {}` block here
  # (or pass -backend-config flags) to switch off local state before this
  # is used by more than one person.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "deliveryapp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront's `viewer_certificate.acm_certificate_arn` (used only when
# var.domain_name is set) must reference a certificate issued in us-east-1
# regardless of which region the rest of this stack runs in — this alias
# exists solely so a data lookup / future `aws_acm_certificate` resource can
# target that region without moving the whole deployment there. Not
# currently used for any resource when var.domain_name is empty.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "deliveryapp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
