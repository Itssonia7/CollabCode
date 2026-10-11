# Build the Frontend [dist folder]
# Copy the dist folder content in Backend/public folder

# FROM node:20-alpine as frontend-builder

# COPY ./Frontend /app

# WORKDIR /app

# RUN npm install

# RUN npm run build

# # Build the Backend
# FROM node:20-alpine

# COPY ./Backend /app

# WORKDIR /app

# RUN npm install

# COPY --from=frontend-builder /app/dist /app/public

# CMD ["node", "server.js"] 


# --------------------------------------------------
# Build Frontend
# --------------------------------------------------

FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY ./Frontend/package*.json ./

RUN npm ci

COPY ./Frontend ./

RUN npm run build


# --------------------------------------------------
# Build Backend
# --------------------------------------------------

FROM node:20-alpine

WORKDIR /app

COPY ./Backend/package*.json ./

RUN npm ci --omit=dev

COPY ./Backend ./

COPY --from=frontend-builder /app/dist /app/public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]