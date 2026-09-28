# ------------------------------------------------------------------------------
# CloudFront — two distributions:
#   1. `app`   — public entry point for the Next.js app itself. Terminates
#      real TLS (either the default *.cloudfront.net certificate, or a
#      custom domain's ACM certificate if var.domain_name is set) and
#      forwards to the ALB over HTTP with the shared-secret header from
#      alb.tf so the ALB can reject anything that skipped CloudFront.
#   2. `media` — public read-only CDN in front of the private S3 media
#      bucket (s3_media.tf), via Origin Access Control so the bucket itself
#      is never publicly reachable.
#
# Why CloudFront in front of the ALB at all (rather than just an ACM cert on
# the ALB directly): it's the one piece of this stack that's fully usable
# with **zero domain purchase or DNS setup** — every distribution gets a
# working https://xxxxxxxxxxxxxx.cloudfront.net URL immediately after
# `terraform apply`, which matters a lot for "make it ready to work" without
# extra manual steps. A custom domain (var.domain_name) is optional and
# layers on top of the same distribution.
# ------------------------------------------------------------------------------

locals {
  app_domain_aliases = var.domain_name != "" ? [var.domain_name] : []

  app_public_url = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"

  # Origins allowed to PUT directly to the media S3 bucket (CORS) — the
  # app's own public URL, both with and without a custom domain, so image
  # uploads work whichever one the browser is currently on.
  app_origins = distinct(compact([
    "https://${aws_cloudfront_distribution.app.domain_name}",
    var.domain_name != "" ? "https://${var.domain_name}" : "",
  ]))
}

resource "aws_cloudfront_distribution" "app" {
  enabled     = true
  comment     = "${local.name_prefix} app"
  aliases     = local.app_domain_aliases
  price_class = "PriceClass_200" # skips the most expensive edge locations (South America/Australia/etc.) — adjust if the platform expands there

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port              = 443
      origin_protocol_policy  = "http-only" # CloudFront -> ALB traffic stays on the AWS backbone; public TLS is terminated here at CloudFront
      origin_ssl_protocols    = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods         = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true

    # This is a dynamic, session-cookie/CSRF-cookie-driven app (see
    # src/middleware.ts) — every request must reach the origin with its
    # original cookies/headers/query string, and nothing should be cached
    # by default. Static Next.js build assets under /_next/static/* get
    # their own long-cache behavior below instead.
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Accept", "Content-Type", "Cookie", "x-csrf-token"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Next.js's own build output is content-hashed and immutable — safe to
  # cache aggressively at the edge, unlike everything else in this app.
  ordered_cache_behavior {
    path_pattern            = "/_next/static/*"
    target_origin_id        = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true

    forwarded_values {
      query_string = false
      headers      = []
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.domain_name != "" ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.domain_name == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = { Name = "${local.name_prefix}-app-cdn" }
}

resource "aws_cloudfront_distribution" "media" {
  enabled     = true
  comment     = "${local.name_prefix} media"
  price_class = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "media-s3"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods         = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 604800
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "${local.name_prefix}-media-cdn" }
}
