# ------------------------------------------------------------------------------
# Application Load Balancer — sits in the public subnets, in front of the
# ECS app tasks (private subnets). TLS termination for public traffic
# actually happens at CloudFront (see cdn.tf); this ALB only ever receives
# plain HTTP from CloudFront over the AWS backbone network, which is why its
# listener is HTTP-only. To stop anyone from bypassing CloudFront and
# hitting this ALB's own public DNS name directly, every request must carry
# a secret header (`X-Origin-Verify`) that only this Terraform-managed
# CloudFront distribution knows — requests without it are rejected with a
# static 403 at the listener level, before ever reaching an ECS task.
# ------------------------------------------------------------------------------

resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

resource "aws_lb" "app" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # Fargate tasks are recycled fast during a rolling deploy; a short
  # deregistration delay avoids the ALB holding old tasks open for the
  # full default 300s during every deploy.
  idle_timeout = 60

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-app-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for awsvpc-networking Fargate tasks

  deregistration_delay = 30

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  tags = { Name = "${local.name_prefix}-app-tg" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  # Default: reject anything that didn't come through CloudFront.
  default_action {
    type = "fixed-response"
    fixed_response {
      status_code  = "403"
      content_type = "text/plain"
      message_body = "Direct access to this load balancer is not permitted."
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront_only" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values            = [random_password.origin_verify.result]
    }
  }
}
