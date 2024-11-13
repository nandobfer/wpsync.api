# Stage 1: Build Stage
FROM node:22 AS build

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# Stage 2: Production Stage
FROM node:22
WORKDIR /app

# Copy node modules and build from the build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Start the application
CMD ["/bin/bash", "-c", "npx prisma migrate deploy && node dist/index.js"]
