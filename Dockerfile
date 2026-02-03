FROM node:22-slim

# Утилиты для конвертации PDF и DOCX в изображения
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY tsconfig.json ./

RUN npm install typescript && npm run build && rm -rf node_modules && npm ci --only=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
