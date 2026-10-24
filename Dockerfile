# Static build: tests gate the Vite build, nginx serves dist/.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The deploy checkout is made under umask 077, so files arrive mode 600;
# nginx workers run unprivileged and would answer 403 without this.
RUN npm test && npm run build && chmod -R a+rX dist

FROM nginx:1.27-alpine AS runtime
ARG REVISION=unknown
LABEL org.opencontainers.image.title="name-em-all" \
      org.opencontainers.image.source="https://github.com/michaelmendoza42/name-em-all" \
      org.opencontainers.image.revision="${REVISION}"
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
