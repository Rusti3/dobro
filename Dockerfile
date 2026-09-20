FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html ./
COPY src ./src
COPY public ./public
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 DB_PATH=/app/var/app.sqlite
COPY --from=build /app/dist ./dist
COPY server ./server
COPY data ./data
COPY russiantrustedca.pem ./russiantrustedca.pem
COPY package.json ./
RUN mkdir /app/var && chown node:node /app/var
USER node
EXPOSE 3210
CMD ["node", "server/index.js"]
