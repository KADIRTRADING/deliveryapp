#!/usr/bin/env bash
# Runs `npm run db:seed` as a one-off ECS Fargate task against the
# production database, using the same network/task-role configuration as
# the app itself. Intended to be run ONCE, right after the very first
# successful deploy, to create the Uzbekistan location hierarchy and the
# demo SUPER_ADMIN/RESTAURANT_OWNER accounts documented in
# docs/AWS_DEPLOYMENT.md.
#
# Usage:
#   ./scripts/aws/seed.sh
#
# Requires: aws CLI configured with credentials that can call ecs:RunTask
# in the target account/region (your own IAM user/role — this script is
# for local/manual use, unlike deploy-aws.yml which uses OIDC), and the
# Terraform outputs below already applied.
set -euo pipefail

cd "$(dirname "$0")/../../infra/aws/terraform"

CLUSTER=$(terraform output -raw ecs_cluster_name)
MIGRATE_TASK_FAMILY=$(terraform output -raw ecs_migrate_task_definition_family)
SUBNETS=$(terraform output -json private_subnet_ids | jq -r 'join(",")')
SECURITY_GROUP=$(terraform output -raw app_security_group_id)

echo "Registering a one-off seed task definition (based on the current migrate task definition — it already points at the migrator image, which has the Prisma CLI + tsx that 'npm run db:seed' needs — with the container command overridden)..."

CURRENT_TASKDEF=$(aws ecs describe-task-definition --task-definition "$MIGRATE_TASK_FAMILY" --query 'taskDefinition')

SEED_TASKDEF_ARN=$(aws ecs register-task-definition \
  --family "${MIGRATE_TASK_FAMILY}-seed" \
  --task-role-arn "$(echo "$CURRENT_TASKDEF" | jq -r '.taskRoleArn')" \
  --execution-role-arn "$(echo "$CURRENT_TASKDEF" | jq -r '.executionRoleArn')" \
  --network-mode "$(echo "$CURRENT_TASKDEF" | jq -r '.networkMode')" \
  --requires-compatibilities FARGATE \
  --cpu "$(echo "$CURRENT_TASKDEF" | jq -r '.cpu')" \
  --memory "$(echo "$CURRENT_TASKDEF" | jq -r '.memory')" \
  --container-definitions "$(echo "$CURRENT_TASKDEF" | jq '.containerDefinitions | map(.command = ["npm", "run", "db:seed"])')" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

echo "Running $SEED_TASKDEF_ARN ..."

RUN_TASK_OUTPUT=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$SEED_TASKDEF_ARN" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=DISABLED}")

TASK_ARN=$(echo "$RUN_TASK_OUTPUT" | jq -r '.tasks[0].taskArn')
if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "null" ]; then
  echo "Failed to start seed task:"
  echo "$RUN_TASK_OUTPUT" | jq '.failures'
  exit 1
fi

echo "Seed task started: $TASK_ARN"
echo "Waiting for it to finish..."
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"

EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)

if [ "$EXIT_CODE" != "0" ]; then
  echo "Seed task exited with code $EXIT_CODE. Check its CloudWatch log stream (log group /ecs/<project>-<env>/migrate) for details."
  exit 1
fi

echo "Seed completed successfully."
echo ""
echo "Demo accounts (see prisma/seed.ts) — CHANGE THESE PASSWORDS before letting real traffic near this environment:"
echo "  SUPER_ADMIN:        +998900000000 / ChangeMe123!"
echo "  RESTAURANT_OWNER:   +998901111111 / ChangeMe123!"
