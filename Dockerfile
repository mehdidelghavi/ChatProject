# Builds the node_modules bundle that the runtime stage consumes as `depsstage`.
#
# npm ci runs INSIDE the build rather than expecting a node_modules directory in
# the build context: node_modules is gitignored and .dockerignore excludes it,
# so a `COPY node_modules ./node_modules` could never resolve on a clean CI
# checkout.
#
# Only package.json and package-lock.json are copied into this stage. That is
# what makes the layer cache useful: editing app.js or a view does not touch
# these two files, so Docker reuses the cached npm ci layer and the rebuild
# takes seconds instead of re-downloading every dependency.
#
# `npm ci` (not `npm install`) because it installs exactly what package-lock.json
# pins and fails loudly if the lockfile and package.json disagree — a build must
# be reproducible.
FROM node:20-bookworm-slim AS depsstage

WORKDIR /deps

COPY package.json package-lock.json ./

RUN npm ci --omit=dev


FROM node:20-bookworm-slim

WORKDIR /var/www/html

COPY . .
COPY --from=depsstage /deps/node_modules ./node_modules

# The app writes nothing to disk today (console.log goes to the container's
# stdout, readable via `docker compose logs`). The directory exists so that the
# ./logs bind mount in docker-compose.yml has a valid target and is already
# writable the day file logging is added.
RUN mkdir -p /var/log/app && chown -R node:node /var/log/app

RUN chown -R node:node /var/www/html

# Never run as root. The `node` user ships with the official image at uid 1000,
# which matches the host user here, so the bind-mounted source stays writable.
USER node

EXPOSE 3000

# Uses node's own http module rather than curl/wget: the slim image ships
# neither, and adding a package just for a healthcheck is not worth the layer.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/login',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "app.js"]
