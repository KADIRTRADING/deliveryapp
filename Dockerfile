# syntax=docker/dockerfile:1

# ---- base -------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# ---- deps --------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- development ---------------------------------------------------------
# Used by docker-compose for local dev: source is bind-mounted, so this stage
# only needs dependencies installed; `npm run dev` runs against live-mounted code.
FROM deps AS development
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- production ----------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
