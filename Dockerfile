FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# npmmirror: the official registry crawls from mainland-CN servers (<1KB/s here).
RUN npm ci --registry=https://registry.npmmirror.com
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/ ./
RUN rm -rf ./.claude
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
