FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 19109

CMD ["sh", "-c", "npm run seed && npm start"]
