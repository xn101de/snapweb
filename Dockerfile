# Home-lab image build (gitignored, force-added on the `homelab` branch only —
# never include in an upstream PR). Builds the snapweb client and ships ONLY the
# compiled static assets, so the published image carries no source and no
# private configuration. snapserver-specific config stays in local volumes on
# the deploy host, which consumes this image via `COPY --from`.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
