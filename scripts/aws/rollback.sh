#!/usr/bin/env bash
# Rolls the ECS app service back to a previous task definition revision.
# Usage:
#   ./scripts/aws/rollback.sh <revision-number>
#
# List available revisions first with:
#   aws ecs list-task-definitions --family-prefix <project>-<env>-app --sort DESC
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <revision-number>"
  echo ""
  echo "Available revisions:"
  cd "$(dirname "$0")/../../infra/aws/terraform"
  FAMILY=$(terraform output -raw ecs_app_task_definition_family)
  aws ecs list-task-definitions --family-prefix "$FAMILY" --sort DESC --query 'taskDefinitionArns' --output table
  exit 1
fi

cd "$(dirname "$0")/../../infra/aws/terraform"

CLUSTER=$(terraform output -raw ecs_cluster_name)
SERVICE=$(terraform output -raw ecs_service_name)
FAMILY=$(terraform output -raw ecs_app_task_definition_family)

TARGET_TASKDEF="${FAMILY}:${1}"

echo "Rolling back ${SERVICE} to ${TARGET_TASKDEF} ..."

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$TARGET_TASKDEF" \
  --force-new-deployment > /dev/null

echo "Waiting for the service to stabilize..."
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

echo "Rollback complete."
