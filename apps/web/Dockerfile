FROM node:24-alpine AS base
WORKDIR /app
ENV npm_config_update_notifier=false
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
ARG NEXT_PUBLIC_SHOW_DEMO_HINTS=false
ENV NEXT_PUBLIC_SHOW_DEMO_HINTS=$NEXT_PUBLIC_SHOW_DEMO_HINTS
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @crm/shared && npm run build -w @crm/web
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S crm && adduser -S crm -G crm
COPY --from=build --chown=crm:crm /app/node_modules ./node_modules
COPY --from=build --chown=crm:crm /app/package.json ./package.json
COPY --from=build --chown=crm:crm /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=crm:crm /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=crm:crm /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=crm:crm /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=build --chown=crm:crm /app/apps/web/.next ./apps/web/.next
COPY --from=build --chown=crm:crm /app/apps/web/public ./apps/web/public
USER crm
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@crm/web"]
