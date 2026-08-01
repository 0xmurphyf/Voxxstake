FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --include=dev

COPY frontend/package.json frontend/.npmrc ./frontend/
RUN cd frontend && npm install --include=dev

COPY backend ./backend
COPY frontend ./frontend

RUN cd frontend && npm run build
COPY icon-192x192.png icon-512x512.png site.webmanifest ./frontend/build/
RUN node -e "const fs=require('fs');const p='frontend/build/icon-512x512.png';const b=fs.readFileSync(p);if(b.toString('hex',0,8)!=='89504e470d0a1a0a'||b.readUInt32BE(16)!==512||b.readUInt32BE(20)!==512)throw new Error(p+' must be a real 512x512 PNG')"

ENV NODE_ENV=production
EXPOSE 8001

CMD ["./backend/node_modules/.bin/tsx", "backend/src/index.ts"]
