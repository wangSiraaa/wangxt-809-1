FROM node:18-alpine

WORKDIR /app

COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN cd backend && npm install
RUN cd frontend && npm install

COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN cd frontend && npm run build

EXPOSE 19109 20109

CMD ["sh", "-c", "cd backend && npm start & cd frontend && npm run dev"]
