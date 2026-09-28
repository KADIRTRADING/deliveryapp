#!/usr/bin/env bash
# Manually runs `prisma migrate deploy` against the production database as
# a one-off ECS Fargate task, using the `migrate` task definition Terraform
# already created (infra/aws/terraform/ecs.tf). deploy-aws.yml runs this
# same operation automatically before every deploy — use this script only
# for out-of-band situations (e.g. re-running a migration after fixing a
# transient failure, or applying a schema change without a full app
# deploy).
#
# Usage:
#   ./scripts/aws/migrate.sh [image-tag]
#
# If image-tag is omitted, uses whatever image the `migrate` task
# definition's latest revision already points at (i.e. the last image any
# previous deploy or migrate run used).
set -euo pipefail

cd "$(dirname "$0")/../../infra/aws/terraform"

CLUSTER=$(terraform output -raw ecs_cluster_name)
MIGRATE_TASK_FAMILY=$(terraform output -raw ecs_migrate_task_definition_family)
SUBNETS=$(terraform output -json private_subnet_ids | jq -r 'join(",")')
SECURITY_GROUP=$(terraform output -raw app_security_group_id)

TASKDEF_ARG="$MIGRATE_TASK_FAMILY"

if [ "${1:-}" != "" ]; then
  ECR_URL=$(terraform output -raw ecr_repository_url)
  CURRENT_TASKDEF=$(aws ecs describe-task-definition --task-definition "$MIGRATE_TASK_FAMILY" --query 'taskDefinition')
  # Migration/seed tasks always run the "-migrator" image variant (Prisma
  # CLI + devDependencies) — see the Dockerfile's `migrator` stage comment
  # and deploy-aws.yml, which builds/pushes it alongside the slim
  # production image under this same suffix convention.
  TASKDEF_ARG=$(aws ecs register-task-definition \
    --family "$MIGRATE_TASK_FAMILY" \
    --task-role-arn "$(echo "$CURRENT_TASKDEF" | jq -r '.taskRoleArn')" \
    --execution-role-arn "$(echo "$CURRENT_TASKDEF" | jq -r '.executionRoleArn')" \
    --network-mode "$(echo "$CURRENT_TASKDEF" | jq -r '.networkMode')" \
    --requires-compatibilities FARGATE \
    --cpu "$(echo "$CURRENT_TASKDEF" | jq -r '.cpu')" \
    --memory "$(echo "$CURRENT_TASKDEF" | jq -r '.memory')" \
    --container-definitions "$(echo "$CURRENT_TASKDEF" | jq --arg IMAGE "${ECR_URL}:${1}-migrator" '.containerDefinitions | map(.image = $IMAGE)')" \
    --query 'taskDefinition.taskDefinitionArn' --output text)
  echo "Using image tag '${1}-migrator' (registered $TASKDEF_ARG)"
fi

RUN_TASK_OUTPUT=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TASKDEF_ARG" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=DISABLED}")

TASK_ARN=$(echo "$RUN_TASK_OUTPUT" | jq -r '.tasks[0].taskArn')
if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "null" ]; then
  echo "Failed to start migration task:"
  echo "$RUN_TASK_OUTPUT" | jq '.failures'
  exit 1
fi

echo "Migration task started: $TASK_ARN"
echo "Waiting for it to finish..."
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"

EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)

if [ "$EXIT_CODE" != "0" ]; then
  echo "Migration task exited with code $EXIT_CODE."
  exit 1
fi

echo "Migration completed successfully."
