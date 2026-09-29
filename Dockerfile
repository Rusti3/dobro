FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN SCARF_ANALYTICS=false npm ci --no-audit --no-fund --prefer-offline
COPY . .
RUN npm run build && node scripts/prepare-runtime.mjs

FROM node:24-alpine
WORKDIR /app
ARG APP_COMMIT=local
LABEL org.opencontainers.image.title="хелпи" org.opencontainers.image.revision=$APP_COMMIT
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 APP_COMMIT=$APP_COMMIT
COPY --from=build /release/ ./
USER node
EXPOSE 3210
CMD ["node", "server/index.js"]
