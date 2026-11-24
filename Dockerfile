# ローカル開発用のイメージ。compose.yaml の migrate と api で使う。
# 本番は Lambda で動かすので、このイメージは使わない。
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
