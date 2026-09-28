# Deploying DeliveryApp to AWS

This is a complete, step-by-step runbook for taking this repository from
"code on GitHub" to "running in your own AWS account, reachable over HTTPS."
Follow the steps in order the first time; after that, day-to-day deploys are
just step 8.

## What gets created

```
Internet
   │
   ▼
CloudFront (app)  ──HTTPS, free *.cloudfront.net domain──▶  you
   │  (shared-secret header, origin locked down)
   ▼
Application Load Balancer  (public subnets)
   │
   ▼
ECS Fargate service "app"  (private subnets, 2+ tasks, autoscaling)
   │                              │
   ▼                              ▼
RDS PostgreSQL 16          ElastiCache Redis 7
(private subnet)           (private subnet)

CloudFront (media) ──HTTPS──▶ S3 bucket (restaurant/product images)
                               (private; only CloudFront can read it)

ECR                 — holds the Docker images
Secrets Manager      — DATABASE_URL/REDIS_URL/payment/map/SMS credentials
GitHub Actions OIDC role — lets CI deploy with no long-lived AWS key
CloudWatch Logs + Alarms + SNS — logs and basic alerting
```

Everything is defined as code in [`infra/aws/terraform/`](../infra/aws/terraform)
and deploys via [`.github/workflows/deploy-aws.yml`](../.github/workflows/deploy-aws.yml).
No manual clicking in the AWS console is required for the infrastructure
itself — you'll run `terraform apply` once, then trigger one GitHub Actions
workflow to deploy the app.

**You do NOT need to buy a domain name.** The app is fully reachable over
real HTTPS at a `*.cloudfront.net` URL the moment `terraform apply` finishes.
A custom domain is an optional, later step (see [Custom domain](#custom-domain-optional)).

## Cost

Running this continuously costs roughly **$45–75/month** on a new AWS
account (less for the first 12 months — RDS `db.t4g.micro` and 750 hours of
Fargate-equivalent-ish usage have Free Tier allowances, though Fargate itself
isn't part of the standard Free Tier). The biggest line items:

| Resource                                         | Approx. monthly cost |
| ------------------------------------------------ | -------------------- |
| ECS Fargate (2 tasks × 0.5 vCPU/1GB, always on)  | ~$25–30              |
| NAT Gateway (fixed fee + data)                   | ~$33 + $0.045/GB     |
| RDS `db.t4g.micro` (single-AZ)                   | ~$12                 |
| ElastiCache `cache.t4g.micro`                    | ~$11                 |
| ALB                                              | ~$16 + usage         |
| CloudFront, S3, ECR, Secrets Manager, CloudWatch | a few dollars        |

To cut this down for a demo/low-traffic deployment: set `enable_nat_gateway
= false` (only safe if you never enable real Payme/Click/Mapbox/Eskiz —
those need outbound internet from the private subnets), drop
`app_desired_count`/`app_min_count` to `1`, and use `db.t4g.micro` +
`cache.t4g.micro` (already the defaults). See [Teardown](#teardown-avoiding-ongoing-cost)
to stop paying entirely when you're done evaluating it.

---

## Step 0 — Prerequisites

- An AWS account. [Create one free](https://aws.amazon.com/free/) if you
  don't have one — no infrastructure here requires anything beyond the
  standard signup (a credit card is required by AWS itself, but nothing in
  this stack requires paid support or Business/Enterprise tiers).
- The [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  installed on your own machine (this repository's sandbox already has it,
  but Terraform must be run somewhere with real AWS network access —
  your laptop, or a GitHub Actions runner; see the note in
  [Step 2](#step-2--create-an-iam-user-for-terraform)).
- [Terraform ≥ 1.6](https://developer.hashicorp.com/terraform/install)
  installed locally.
- `git`, `jq`, and `docker` (for testing image builds locally, optional —
  CI already verifies every image builds).
- Admin access to the `KADIRTRADING/deliveryapp` GitHub repository (to add
  Actions secrets/variables and trigger the deploy workflow).

## Step 1 — Clone and check out this branch

```bash
git clone https://github.com/KADIRTRADING/deliveryapp.git
cd deliveryapp
git checkout main   # or whichever branch this AWS infra PR was merged into
```

## Step 2 — Create an IAM user for Terraform

Terraform needs its own AWS credentials to create infrastructure. Using
your AWS account's **root** credentials for this is strongly discouraged.
Create a dedicated IAM user instead:

1. Sign in to the [AWS Console](https://console.aws.amazon.com/) → **IAM** → **Users** → **Create user**.
2. Name it e.g. `deliveryapp-terraform`. Do **not** enable console access —
   this user only ever needs programmatic (CLI) access.
3. Attach the **`AdministratorAccess`** managed policy for now (this stack
   touches enough services — VPC, ECS, RDS, ElastiCache, S3, CloudFront,
   IAM, Secrets Manager — that hand-scoping a policy is impractical for a
   first deploy; you can tighten this later once the stack is stable).
4. After creating the user, go to **Security credentials** → **Create access key** → choose **Command Line Interface (CLI)** → create it, and copy both the **Access key ID** and **Secret access key** (you only get to see the secret once).
5. Configure the AWS CLI with these credentials on the machine you'll run
   Terraform from:

   ```bash
   aws configure --profile deliveryapp-terraform
   # AWS Access Key ID: <paste>
   # AWS Secret Access Key: <paste>
   # Default region name: us-east-1
   # Default output format: json

   export AWS_PROFILE=deliveryapp-terraform
   aws sts get-caller-identity   # confirms it works
   ```

## Step 3 — Configure Terraform variables

```bash
cd infra/aws/terraform
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and set at minimum:

```hcl
github_repository = "KADIRTRADING/deliveryapp"   # your actual owner/repo
```

Everything else has a working default. Leave `payme_merchant_id`,
`mapbox_server_token`, `eskiz_email`, etc. empty for now — the app runs
completely functionally with mock providers (see
[Going live with real providers](#going-live-with-real-providers-optional)
for how to add real ones later without redeploying infrastructure).

## Step 4 — `terraform init` and `apply`

```bash
terraform init
terraform plan    # review what will be created — should show ~60-70 resources to add, 0 to change/destroy
terraform apply   # type "yes" when prompted
```

This takes **10–15 minutes** the first time (RDS and ElastiCache are the
slowest pieces — CloudFront distributions can also take a few minutes to
fully deploy globally after `apply` reports success). When it finishes,
note the outputs:

```bash
terraform output
```

You'll see `app_url` (something like `https://d1a2b3c4d5e6f7.cloudfront.net`),
`ecr_repository_url`, `github_actions_deploy_role_arn`, and others used in
the next steps.

**If `apply` fails partway through:** re-run `terraform apply` — Terraform
is idempotent and will pick up where it left off, creating only what's
still missing. If it fails on `aws_db_instance.main` or
`aws_elasticache_replication_group.main` with a capacity/quota error, your
account may need a service quota increase for that instance type in that
region (rare on a fresh account, but request one via **Service Quotas** in
the console if it happens).

## Step 5 — Wire up GitHub Actions for CI/CD

The deploy workflow ([`.github/workflows/deploy-aws.yml`](../.github/workflows/deploy-aws.yml))
authenticates to AWS via OpenID Connect — no AWS access key is stored in
GitHub at all. Terraform already created the IAM role and trust policy
(`github_oidc.tf`); you just need to tell GitHub which values to use.

In the GitHub repo: **Settings → Secrets and variables → Actions**.

### Variables tab — add these (all plain, non-secret values):

| Name                      | Value (from `terraform output`)                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`              | the region you deployed to, e.g. `us-east-1`                                                                            |
| `AWS_DEPLOY_ROLE_ARN`     | `github_actions_deploy_role_arn`                                                                                        |
| `ECR_REPOSITORY`          | just the repo name portion, e.g. `deliveryapp` (not the full URL)                                                       |
| `ECS_CLUSTER`             | `ecs_cluster_name`                                                                                                      |
| `ECS_SERVICE`             | `ecs_service_name`                                                                                                      |
| `ECS_APP_TASK_FAMILY`     | `ecs_app_task_definition_family`                                                                                        |
| `ECS_MIGRATE_TASK_FAMILY` | `ecs_migrate_task_definition_family`                                                                                    |
| `ECS_SUBNETS`             | the two private subnet IDs from `private_subnet_ids`, quoted and comma-joined, e.g. `"subnet-0123abc","subnet-0456def"` |
| `ECS_SECURITY_GROUP`      | `app_security_group_id`                                                                                                 |

You can print all of these at once:

```bash
terraform output -json | jq -r '
  to_entries | map("\(.key)=\(.value.value)") | .[]
'
```

(For `ECS_SUBNETS`, format it as shown above — it needs to render as
`awsvpcConfiguration={subnets=[...]}` inside the workflow's shell script.)

No secrets need to be added — the OIDC trust means there's no AWS access
key to store.

## Step 6 — First deploy

Go to the **Actions** tab → **Deploy to AWS** workflow → **Run workflow** →
leave `image_tag` blank (it defaults to the commit SHA) → **Run workflow**.

This will:

1. Build the production Docker image and push it to ECR.
2. Build the migrator image (Prisma CLI + `tsx`) and push it to ECR.
3. Run `prisma migrate deploy` as a one-off ECS task — this creates every
   table in `prisma/schema.prisma` in the new RDS database.
4. Roll the ECS service to the new image (2 tasks, health-checked,
   automatically rolled back if the new tasks never pass `/api/health`).

Watch it run in the Actions tab. It takes about 5–8 minutes end to end,
mostly the Docker build and the ECS deployment's health-check grace period.

## Step 7 — Seed initial data and verify

The database is empty after migrations alone — no regions/cities, no demo
restaurant, no admin account. Seed it once:

```bash
cd infra/aws/terraform
../../../scripts/aws/seed.sh
```

(Run this with the same AWS CLI credentials/profile you used for Terraform
— `export AWS_PROFILE=deliveryapp-terraform` if you're in a new shell.)

Then verify the app is actually up:

```bash
curl https://$(terraform output -raw app_cloudfront_domain)/api/health
# {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

Open `terraform output -raw app_url` (or just the CloudFront domain) in a
browser. Sign in with the seeded demo account:

- **Restaurant owner:** `+998901111111` / `ChangeMe123!`
- **Super admin:** `+998900000000` / `ChangeMe123!`

**Change or delete these accounts before pointing real users at this
environment** — they're clearly documented, publicly-known development
credentials (see `prisma/seed.ts`).

You now have the full customer journey working end to end on real AWS
infrastructure: browse the demo restaurant, add items to cart, save an
address, check out with cash or the mock online-payment flow, and watch
live order-status updates.

## Step 8 — Every deploy after this one

Just re-run the **Deploy to AWS** workflow from the Actions tab (or push a
tag/commit and trigger it — it's `workflow_dispatch` only by design; see
that workflow file's header comment for why). It always:

1. Builds from the current state of the branch you run it against.
2. Runs migrations first — if a migration fails, the app is never touched.
3. Rolls the service with automatic rollback on failed health checks.

To roll back manually to a previous release without rebuilding anything:

```bash
./scripts/aws/rollback.sh <revision-number>
# list available revisions if you don't know the number:
./scripts/aws/rollback.sh
```

---

## Custom domain (optional)

By default the app is served at its CloudFront URL — this works completely
fine, including for testing payment provider webhooks (Payme/Click) which
only require a stable HTTPS URL, not any particular domain. If you want
your own domain instead:

1. **Request or import an ACM certificate in `us-east-1`** (CloudFront only
   accepts certificates from that region, regardless of which region the
   rest of the stack runs in):

   ```bash
   aws acm request-certificate \
     --region us-east-1 \
     --domain-name delivery.example.com \
     --validation-method DNS
   ```

   This returns a `CertificateArn`. AWS will give you a CNAME record to add
   at your domain registrar/DNS provider to prove ownership — add it, then
   wait for `aws acm describe-certificate --region us-east-1 --certificate-arn <arn>`
   to report `Status: ISSUED` (usually a few minutes after the DNS record
   propagates).

2. Set in `terraform.tfvars`:

   ```hcl
   domain_name         = "delivery.example.com"
   acm_certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..."
   ```

3. `terraform apply` again.

4. Point your domain at the CloudFront distribution: create a `CNAME` (or,
   if your DNS provider supports it and your domain is the zone apex, an
   `ALIAS`/`ANAME`) record for `delivery.example.com` → the value of
   `terraform output app_cloudfront_domain`.

5. Also update `APP_URL` implicitly follows — the app reads its own public
   URL from the `APP_URL` environment variable, which Terraform already
   sets to `https://delivery.example.com` once `domain_name` is set (see
   `local.app_public_url` in `cdn.tf`) — no extra step needed.

## Going live with real providers (optional)

Everything ships with safe mock adapters (see the main [README](../README.md#provider-abstractions)):
fake payment confirmation instead of real Payme/Click charges, deterministic
stub geocoding instead of real Mapbox lookups, OTP codes logged to
CloudWatch instead of real SMS via Eskiz. To switch any of these on:

1. Obtain the real credentials (Payme/Click merchant onboarding, a Mapbox
   account + secret token, an Eskiz.uz account).
2. Set the corresponding variables in `terraform.tfvars`, e.g.:

   ```hcl
   payment_default_provider = "payme"
   payme_merchant_id        = "..."
   payme_secret_key         = "..."
   ```

3. `terraform apply` — this updates the value in Secrets Manager (see
   `secrets.tf`) but does **not** by itself restart the running app tasks
   (ECS tasks read secrets only at container start).
4. Force a fresh deployment so the running tasks pick up the new secret
   value:

   ```bash
   aws ecs update-service \
     --cluster $(terraform output -raw ecs_cluster_name) \
     --service $(terraform output -raw ecs_service_name) \
     --force-new-deployment
   ```

The app **fails fast at container startup** if you set
`payment_default_provider = "payme"` without both `payme_merchant_id` and
`payme_secret_key` — see `assertProductionCredentials()` in
`src/lib/env.ts`. This is intentional: it's much better to have a
container that refuses to start than one that silently falls back to fake
payment confirmations in production.

For the Payme/Click webhook callback URLs you'll register with those
providers, use:

```
https://<your app_url>/api/payments/webhooks/payme
https://<your app_url>/api/payments/webhooks/click
```

## Monitoring and logs

- **Live logs:** `./scripts/aws/logs.sh` (app) or `./scripts/aws/logs.sh migrate`.
- **CloudWatch console:** log groups `/ecs/<project>-<environment>/app` and
  `/ecs/<project>-<environment>/migrate`.
- **Alarms:** if you set `alert_email` in `terraform.tfvars`, you'll get an
  SNS subscription-confirmation email after `apply` — click the link in it
  to start receiving alerts for backend 5xx spikes, zero healthy targets,
  and low RDS storage (see `monitoring.tf` for exact thresholds).
- **ECS console:** cluster → service → shows running task count, recent
  deployment events, and links to each task's logs directly.

## Rotating secrets

`DATABASE_URL` and `REDIS_URL` are generated by Terraform and never need
manual rotation under normal operation. To rotate a provider credential
(e.g. after a Payme secret key rotation):

```bash
aws secretsmanager put-secret-value \
  --secret-id $(cd infra/aws/terraform && terraform output -raw secrets_manager_secret_arn) \
  --secret-string '{"DATABASE_URL":"...","REDIS_URL":"...","PAYME_SECRET_KEY":"<new value>", ...}'
```

You must supply the **entire** JSON object each time (Secrets Manager
replaces the whole secret string, not individual keys) — the simplest way
to get the current full value to edit is
`aws secretsmanager get-secret-value --secret-id <arn> --query SecretString --output text | jq .`
(the output will contain the current plaintext values — handle it
accordingly). Then force a new deployment as in step 4 above so running
tasks pick it up.

Alternatively, just update the relevant `terraform.tfvars` value and
`terraform apply` again — same effect, and it's what's recommended for
anything already exposed as a Terraform variable.

## Teardown (avoiding ongoing cost)

```bash
cd infra/aws/terraform
terraform destroy
```

This deletes everything Terraform created, **including the RDS database**
— it takes a final snapshot first (see `rds.tf`'s `skip_final_snapshot =
false`) so your order/user data isn't immediately unrecoverable, but that
snapshot itself continues to incur a small storage cost until you also
delete it manually:

```bash
aws rds describe-db-snapshots --query 'DBSnapshots[?contains(DBSnapshotIdentifier,`deliveryapp`)].DBSnapshotIdentifier'
aws rds delete-db-snapshot --db-snapshot-identifier <name-from-above>
```

If `terraform destroy` fails on the S3 media bucket ("BucketNotEmpty"),
empty it first (all uploaded images will be permanently lost):

```bash
aws s3 rm s3://$(cd infra/aws/terraform && terraform output -raw media_bucket_name) --recursive
terraform destroy   # re-run
```

---

## Troubleshooting

**`terraform apply` hangs or times out on `aws_db_instance.main` /
`aws_elasticache_replication_group.main`:** these genuinely take 5–10
minutes each; Terraform is waiting on AWS, not stuck. Let it run.

**ECS service never reaches steady state / tasks keep restarting:**

```bash
aws ecs describe-services --cluster <cluster> --services <service> --query 'services[0].events[:10]'
```

usually points at the cause directly (failed health checks, can't pull
image, can't resolve secret). Then check `./scripts/aws/logs.sh` for the
container's own stderr/stdout.

**`GET /api/health` returns 503 / `"database":"error"` or `"redis":"error"`:**
confirm the RDS/ElastiCache security groups actually allow the app's
security group (they should, by default — `network.tf` wires this
automatically) and that the app tasks are in the private subnets with a
route to the NAT Gateway if any provider needs outbound internet.

**Deploy workflow fails at "Run database migrations" step:** check the
`/ecs/<project>-<env>/migrate` CloudWatch log group for the Prisma error.
The deploy stops here on purpose — the app service is never updated to an
image whose migrations didn't apply cleanly.

**403 from the ALB when hitting its own `*.elb.amazonaws.com` DNS name
directly:** expected and intentional — see `alb.tf`'s comment. Always use
the CloudFront URL (`app_url` / `app_cloudfront_domain` output).

**Image uploads fail with a CORS error in the browser console:** confirm
you're accessing the app via its actual `app_url` (CloudFront/custom
domain), not some other hostname — `s3_media.tf`'s CORS rule only allows
the origins Terraform knows about (see `local.app_origins` in `cdn.tf`).

**Need to inspect the database directly:** the RDS instance has no public
IP by design. From a machine with access to the VPC (e.g. an ECS Exec
session into a running app task, or a bastion/VPN you set up separately):

```bash
aws ecs execute-command --cluster <cluster> --task <task-id> --container app --interactive --command "/bin/sh"
```

(requires `enableExecuteCommand` on the service, not currently enabled by
default — add `enable_execute_command = true` to the `aws_ecs_service.app`
resource in `ecs.tf` and re-apply if you need this regularly.)
