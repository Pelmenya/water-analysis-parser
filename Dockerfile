FROM node:22

# Установить tesseract-ocr и языковые пакеты (в т.ч. русский)
RUN apt-get update && \
    apt-get install -y tesseract-ocr tesseract-ocr-rus poppler-utils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
