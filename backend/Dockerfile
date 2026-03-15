FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# Ensure DB directory is writable
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV PORT=3001

USER node

EXPOSE 3001

CMD ["node", "server.js"]
