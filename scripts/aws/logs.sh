#!/usr/bin/env bash
# Tails the running app's CloudWatch logs. Usage:
#   ./scripts/aws/logs.sh          # app container logs
#   ./scripts/aws/logs.sh migrate  # migration task logs
set -euo pipefail

STREAM="${1:-app}"

cd "$(dirname "$0")/../../infra/aws/terraform"

PROJECT_ENV=$(terraform output -raw ecs_cluster_name | sed 's/-cluster$//')

aws logs tail "/ecs/${PROJECT_ENV}/${STREAM}" --follow --format short
