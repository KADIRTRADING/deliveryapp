# ------------------------------------------------------------------------------
# ElastiCache Redis — backs rate limiting (src/lib/rate-limit.ts) and the
# realtime order-status pub/sub fan-out (src/modules/orders/realtime.ts).
# A single-node replication group is sufficient for this workload (Redis is
# never the system of record for anything financial — see redis.ts's
# comment — a Redis restart degrades rate limiting/realtime updates, it
# never corrupts an order). Upgrade to a 2-node group with automatic
# failover later if Redis availability becomes a real bottleneck.
# ------------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name_prefix}-redis"
  description           = "DeliveryApp Redis (rate limiting, realtime pub/sub)"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters = 1

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # ioredis client here connects without TLS; enable both together if this is changed (see README before enabling)

  automatic_failover_enabled = false # requires num_cache_clusters >= 2 — not needed for a single-node dev/small-prod deployment

  tags = { Name = "${local.name_prefix}-redis" }
}
