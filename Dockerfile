# ╔════════════════ [ Build stage ] ════════════════════════════════════════════ ]
FROM node:18-alpine as build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prod

# ╔════════════════ [ Clean container ] ═════════════════════════════════════════ ]
FROM node:18-alpine as production

WORKDIR /app
COPY --from=build /app .
COPY . .
CMD npm start