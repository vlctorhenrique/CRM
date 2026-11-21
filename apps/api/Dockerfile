FROM node:24-alpine AS base
WORKDIR /app
ENV npm_config_update_notifier=false

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @crm/shared && npm run build -w @crm/api
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S crm && adduser -S crm -G crm
COPY --from=build --chown=crm:crm /app/node_modules ./node_modules
COPY --from=build --chown=crm:crm /app/package.json ./package.json
COPY --from=build --chown=crm:crm /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=crm:crm /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=crm:crm /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=crm:crm /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=crm:crm /app/apps/api/drizzle ./apps/api/drizzle
USER crm
EXPOSE 3333
CMD ["node", "apps/api/dist/server.js"]
