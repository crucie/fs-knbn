FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci && npx prisma generate

COPY src ./src
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 5000

CMD ["sh", "-c", "node src/runBootstrap.js && npx prisma db push --accept-data-loss && node src/index.js"]
