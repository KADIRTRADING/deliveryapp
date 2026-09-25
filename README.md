# DeliveryApp — Uzbekistan Food & Local Delivery Platform

A production-oriented, API-first food and local delivery platform for Uzbekistan:
multi-role (customer, restaurant staff, courier, admin), Uzbekistan-wide location
hierarchy, server-authoritative pricing, and provider abstractions for
payments, maps, object storage, and SMS so real vendor integrations can be
dropped in without touching business logic.

> **Status:** Phase 9 of 10 (see [Implementation Phases](#implementation-phases)).
> The full platform is functionally complete: authentication/RBAC, the
> Uzbekistan location hierarchy, restaurant/branch/delivery-zone management
> with real geofenced discovery, menus/products/search, cart/checkout with
> server-authoritative pricing, the order lifecycle state machine with
> realtime status and a restaurant dashboard, the admin panel, payments
> (Payme/Click adapters with real signature verification) and promotions,
> reviews/favorites/notifications, courier delivery workflow, and platform/
> restaurant analytics. Phase 10 remains: broader automated test coverage,
> final Docker verification, and deployment documentation.

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Docker](#docker)
- [Testing](#testing)
- [Security Model](#security-model)
- [Provider Abstractions](#provider-abstractions)
- [Internationalization](#internationalization)
- [API Overview](#api-overview)
- [Implementation Phases](#implementation-phases)
- [Troubleshooting](#troubleshooting)

## Architecture

```
src/
  app/                 Next.js App Router — pages + API route handlers (src/app/api/**)
  modules/             Domain logic, organized by bounded context (not by MVC layer)
    auth/              Registration, login, sessions, RBAC, OTP, Zod schemas
    admin/             Audit logging and (future) admin-only operations
    notifications/     SmsProvider abstraction + adapters
  lib/                 Cross-cutting infrastructure: env, prisma, redis, crypto,
                        password hashing, rate limiting, API error handling
  i18n/                next-intl configuration (uz default, ru, en)
prisma/
  schema.prisma        Full normalized data model for the entire platform
  seed.ts              Idempotent dev/demo seed data
messages/              Translation catalogs (uz.json, ru.json, en.json)
tests/                 Vitest unit tests
```

Each module under `src/modules/*` follows a `*.schemas.ts` (Zod validation) →
`*.service.ts` (business logic, talks to Prisma/Redis) → route handler
(`src/app/api/**/route.ts`, thin — parses input, calls the service, maps
errors) layering. Route handlers never contain business logic directly, so
the same service functions can later be reused by a React Native app's
backend calls or by internal admin tooling without duplication.

**Provider abstractions** (map, payments, storage, SMS) are interfaces with a
production adapter and a development/mock adapter, selected by environment
variable — never by editing code. This satisfies the platform requirement
that the app "fail safely when production credentials are missing" while
still being a real, working implementation in development.

## Tech Stack

| Concern               | Choice                        | Why                                                                                  |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Language              | TypeScript (strict mode)      | Type safety across the full stack                                                    |
| Framework             | Next.js 15 (App Router)       | API routes + SSR from one codebase; React Native can consume the same REST API later |
| ORM                   | Prisma 6 + PostgreSQL         | Strong typing, migrations, transactions                                              |
| Cache/Sessions/Queues | Redis (ioredis)               | Rate limiting now; queues/pub-sub for realtime in later phases                       |
| Object storage        | S3-compatible (MinIO locally) | `StorageProvider` interface, swappable to AWS S3/DO Spaces in prod                   |
| Validation            | Zod                           | Single source of truth for input validation, shared error shape                      |
| Styling               | Tailwind CSS                  | Utility-first, fast iteration, small CSS payload                                     |
| i18n                  | next-intl                     | uz (default) / ru / en, JSON message catalogs, no hard-coded UI strings              |
| Testing               | Vitest                        | Fast, native ESM/TS support                                                          |

We pinned **Next.js 15 / Prisma 6** rather than the newest Next 16 / Prisma 7
majors: both introduced significant breaking changes very recently (Next 16
made `params`/`cookies()`/`headers()` async everywhere and renamed the
middleware convention; Prisma 7 requires explicit driver adapters and is
ESM-only). Next 15 and Prisma 6 are both fully current, stable, and
documented — a safer foundation while this codebase can't run a live
`npm install`/build in this development environment to catch subtle
incompatibilities (see Troubleshooting).

## Prerequisites

- Node.js 20+
- Docker + Docker Compose (recommended for local Postgres/Redis/MinIO)
- npm 10+

## Getting Started

```bash
git clone https://github.com/KADIRTRADING/deliveryapp.git
cd deliveryapp
cp .env.example .env

# Install dependencies (generates package-lock.json on first run)
npm install

# Start Postgres, Redis, and MinIO
docker compose up -d postgres redis minio

# Apply the database schema
npm run prisma:migrate

# Seed development data (Tashkent region/city + a SUPER_ADMIN dev account)
npm run db:seed

# Start the dev server
npm run dev
```

The app is served at http://localhost:3000. The seeded super admin account is
`+998900000000` / `ChangeMe123!` — **development only**; never seed this
account in a production database.

## Environment Variables

All variables are documented and validated in `.env.example` and
`src/lib/env.ts`. The app **fails fast at startup** if required variables are
missing or malformed — this is intentional, not a bug: a delivery platform
handling real orders and payments must never boot into a half-configured
state.

Key points:

- `STORAGE_PROVIDER`, `MAP_PROVIDER`, `PAYMENT_DEFAULT_PROVIDER`, and
  `SMS_PROVIDER` each default to a safe mock/console adapter in development
  and require real credentials in production (`NODE_ENV=production`). If a
  production credential is missing, `assertProductionCredentials()` throws
  rather than silently falling back to a mock — see `src/lib/env.ts`.
- No secret is ever read outside `src/lib/env.ts`. No `NEXT_PUBLIC_*`
  variable is used for anything sensitive (API keys are always fetched
  server-side).

## Database

The Prisma schema (`prisma/schema.prisma`) models the full platform per the
project spec: users/roles/sessions, the Uzbekistan region → city → district
hierarchy, addresses, restaurants → branches → delivery zones, menu
categories/products/variants/modifiers, carts, orders with immutable
line-item snapshots and status history, payments, couriers and assignments,
promotions/promo codes, reviews, favorites, notifications, support tickets,
and an append-only audit log.

Conventions:

- All monetary values are `Int` (whole UZS) — never floats — per the
  financial-correctness requirement.
- Soft deletion (`deletedAt`) is used for records with historical/financial
  significance so existing orders/reviews never dangle on a foreign key.
- Every foreign key and hot-path filter column has an explicit `@@index`.

```bash
npm run prisma:validate        # validate schema syntax/relations
npm run prisma:migrate         # create + apply a dev migration
npm run prisma:migrate:deploy  # apply pending migrations (CI/production)
npm run prisma:studio          # visual DB browser
```

## Docker

```bash
docker compose up --build
```

This starts the app, PostgreSQL, Redis, and MinIO together. The `app`
service runs migrations automatically before starting the dev server (see
`docker-compose.yml`). The production `Dockerfile` builds a minimal
standalone Next.js server image (multi-stage; final image contains no
dev dependencies or source maps).

## Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Phase 1 tests cover phone/password validation schemas, password hashing
(scrypt correctness, salting, malformed-hash handling), and core crypto
helpers. Phase 2 adds geospatial utilities (Haversine distance, radius and
polygon membership) and branch open-hours evaluation. Each subsequent phase
adds tests for its own domain (cart pricing, promo validation, order
transitions, payment webhook verification, restaurant authorization) per the
project's testing requirements.

Note: modules marked `import "server-only"` are aliased to a no-op during
Vitest runs (see `vitest.config.ts` / `tests/mocks/server-only.ts`) — that
guard only has meaning inside Next.js's RSC bundler and would otherwise throw
when a service module is imported directly in a unit test.

## Security Model

- **Passwords:** hashed with Node's built-in `scrypt` (no native compiled
  dependency — behaves identically across every environment). See
  `src/lib/password.ts`.
- **Sessions:** opaque random tokens; only a SHA-256 hash is stored in
  Postgres. Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in
  production. Sessions are instantly revocable (logout, password change,
  admin suspension) — this is why we did not choose stateless JWTs.
- **CSRF:** double-submit cookie pattern enforced in `src/middleware.ts` for
  all mutating (`POST`/`PUT`/`PATCH`/`DELETE`) requests to `/api/**`, except
  payment webhook endpoints (which are authenticated via provider signature
  verification instead, since an external webhook cannot participate in a
  cookie-based CSRF handshake).
- **RBAC:** `src/modules/auth/rbac.ts` is the single enforcement point.
  `requireAuth()` / `requireRole()` are called from every protected route —
  never inferred from a hidden UI element.
- **Rate limiting:** Redis-backed fixed-window limiter (`src/lib/rate-limit.ts`)
  applied to login, registration, OTP request/verify, and password reset.
- **User enumeration resistance:** login and password-reset endpoints return
  identical responses/timing regardless of whether the phone number is
  registered.
- **Audit log:** `src/modules/admin/audit-log.service.ts` records
  authentication and (in later phases) administrative actions to an
  append-only table.
- **Environment validation:** `src/lib/env.ts` validates all configuration
  with Zod at startup; production credential presence is asserted per
  provider before that provider is used for a sensitive operation.
- **HTTP security headers:** `next.config.ts` sets `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, and a
  restrictive `Permissions-Policy` on every response.
- **SQL injection / XSS:** all database access goes through Prisma's
  parameterized query builder (no raw SQL anywhere in the codebase); all
  UI rendering goes through React/Next.js's default escaping (no
  `dangerouslySetInnerHTML` anywhere in the codebase).
- **Rate limiting coverage:** beyond auth/OTP, sensitive/billable actions
  are separately throttled — checkout, promo code attempts (a small,
  guessable code space), online payment initiation, geocoding (a paid
  external API in production), and presigned upload requests.
- **Safe error responses:** `handleApiError` (src/lib/api-error.ts) is the
  single response path for every route handler; unexpected errors are
  logged server-side but only ever return an opaque `INTERNAL_ERROR` to
  the client — no stack trace, SQL, or file path is ever returned.

## Provider Abstractions

| Interface         | Location                                    | Dev/Test adapter                                  | Production adapter                                      |
| ----------------- | ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `SmsProvider`     | `src/modules/notifications/sms-provider.ts` | `ConsoleSmsProvider` (logs OTP to server console) | `EskizSmsProvider` (Eskiz.uz gateway)                   |
| `PaymentProvider` | _(Phase 7)_                                 | Mock simulator, no real charges                   | Payme / Click adapters                                  |
| `StorageProvider` | _(Phase 3)_                                 | In-memory mock                                    | S3-compatible (MinIO locally, AWS S3/DO Spaces in prod) |
| `MapProvider`     | `src/modules/locations/map-provider.ts`     | `MockMapProvider` (deterministic stub results)    | `MapboxMapProvider` (server-side secret token only)     |

Each adapter is selected purely by environment variable
(`SMS_PROVIDER`, `PAYMENT_DEFAULT_PROVIDER`, `STORAGE_PROVIDER`, `MAP_PROVIDER`)
so switching providers never requires a code change in calling modules.

### Maps

The client never talks to Mapbox (or any map vendor) directly, and never
holds an API key: `/api/locations/geocode` and `/api/locations/reverse-geocode`
proxy to the server-side `MapProvider`. To enable real geocoding:

1. Create a Mapbox account and generate a **secret** token (`sk.*`), scoped
   to the Geocoding API only.
2. Set `MAP_PROVIDER=mapbox` and `MAPBOX_SERVER_TOKEN=sk.xxxxx` in `.env`.
3. Leave unset (or `MAP_PROVIDER=mock`) for local development — the mock
   adapter returns deterministic, clearly-labeled stub coordinates centered
   on Tashkent so the address-search flow is fully exercisable without any
   external account.

If a future interactive map UI needs a client-side token, it must be a
short-lived, URL-restricted **public** token minted by a dedicated endpoint
— never the raw `MAPBOX_SERVER_TOKEN` read directly by client code.

Delivery-zone membership (radius and polygon) and all distances used in
pricing or restaurant discovery are computed server-side from raw
coordinates via `src/lib/geo.ts` (Haversine distance, ray-casting
point-in-polygon) — never accepted as a client-supplied value.

## Internationalization

Uzbek is the default locale; Russian and English are fully supported.
Translation catalogs live in `messages/{uz,ru,en}.json`. The active locale is
resolved server-side from the `NEXT_LOCALE` cookie in
`src/i18n/request.ts`; components read strings via `next-intl`'s
`useTranslations` / `getTranslations` — no UI copy is hard-coded inline.

## API Overview

Implemented in Phase 1 (all under `/api`):

| Route                       | Method    | Purpose                                        |
| --------------------------- | --------- | ---------------------------------------------- |
| `/api/auth/register`        | POST      | Create a CUSTOMER account, start a session     |
| `/api/auth/login`           | POST      | Authenticate by phone + password               |
| `/api/auth/logout`          | POST      | Revoke the current session                     |
| `/api/auth/me`              | GET       | Fetch the authenticated user (session-derived) |
| `/api/auth/otp/request`     | POST      | Send a phone verification/login/reset OTP      |
| `/api/auth/otp/verify`      | POST      | Verify an OTP code                             |
| `/api/auth/password/forgot` | POST      | Request a password reset link                  |
| `/api/auth/password/reset`  | POST      | Reset password with a valid reset token        |
| `/api/users/me`             | GET/PATCH | View/edit the authenticated user's own profile |
| `/api/users/me/password`    | POST      | Change password (requires current password)    |

Added in Phase 2:

| Route                              | Method           | Purpose                                                 |
| ---------------------------------- | ---------------- | ------------------------------------------------------- |
| `/api/locations/regions`           | GET              | List all Uzbekistan regions                             |
| `/api/locations/cities`            | GET              | List cities, optionally filtered by region              |
| `/api/locations/districts`         | GET              | List districts within a city                            |
| `/api/locations/geocode`           | GET              | Forward geocode a free-text address query               |
| `/api/locations/reverse-geocode`   | GET              | Reverse geocode coordinates to a human-readable address |
| `/api/addresses`                   | GET/POST         | List / save the authenticated user's delivery addresses |
| `/api/addresses/:id`               | GET/PATCH/DELETE | View, edit, or soft-delete a saved address              |
| `/api/restaurants`                 | GET/POST         | Discover serviceable restaurants / create a restaurant  |
| `/api/restaurants/slug/:slug`      | GET              | Public restaurant detail lookup                         |
| `/api/restaurants/:id`             | GET/PATCH        | Management fetch / edit a restaurant's profile          |
| `/api/restaurants/:id/status`      | PATCH            | Admin-only restaurant approval/suspension/archiving     |
| `/api/restaurants/:id/branches`    | GET/POST         | List / add branches for a restaurant                    |
| `/api/branches/:id`                | PATCH/DELETE     | Edit or deactivate a branch                             |
| `/api/branches/:id/delivery-zones` | GET/POST         | List / define delivery zones for a branch               |
| `/api/delivery-zones/:id`          | PATCH/DELETE     | Edit or remove a delivery zone                          |
| `/api/categories`                  | GET/POST         | List restaurant categories / admin-only create          |

`/products`, `/search`, `/cart`, `/orders`, `/payments`, `/promotions`,
`/reviews`, `/favorites`, `/notifications`, `/couriers`, and `/admin` are
delivered in Phases 3–9 per the implementation order below.

## Implementation Phases

1. **Foundation** — scaffold, Docker, Prisma schema, auth, RBAC ✅
2. **Uzbekistan location hierarchy, addresses, map abstraction, restaurants/branches** ✅ _(this phase)_
3. Menus, products, images, search, filters
4. Cart, server-side pricing, delivery zones, checkout
5. Orders, restaurant dashboard, realtime status
6. Admin panel
7. Payments, promotions, reviews, favorites, notifications
8. Courier architecture
9. Analytics, security hardening, audit logs
10. Tests, optimization, production build, Docker verification, deployment docs

## Troubleshooting

- **`Invalid environment configuration` at startup:** run `cp .env.example .env`
  and fill in any variable flagged in the error output; see
  `src/lib/env.ts` for the full validation schema.
- **Prisma client errors after pulling schema changes:** run
  `npm run prisma:generate`.
- **Docker Compose `app` fails health checks immediately after `up`:** the
  `app` service waits for Postgres/Redis/MinIO health checks before running
  migrations; check `docker compose logs postgres redis minio` if it hangs.
- **This repository's CI (`.github/workflows/ci.yml`)** is the canonical way
  every change is verified: install → lint → format check → `prisma validate`
  → typecheck → `prisma migrate deploy` → test → production build. This
  workflow runs on GitHub's infrastructure; consult its logs on each PR for
  the actual pass/fail status of a change.
