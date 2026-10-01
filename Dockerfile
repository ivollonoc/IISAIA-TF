# Imagen de desarrollo (usada por docker-compose.yml).
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
