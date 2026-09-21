#!/bin/sh
# Dropped into /docker-entrypoint.d/, which the nginx image runs, in filename
# order, before it starts nginx. The 99- prefix puts this after the image's own
# 20-envsubst-on-templates.sh, so the config is already rendered by the time
# this runs.
#
# IMPORTANT: this script must return. The entrypoint runs each init script
# synchronously and only starts nginx once they have all finished, so the watch
# loop goes into the background.
#
# What it watches for: certbot lives in a separate container and cannot signal
# this one. The usual workaround is mounting the docker socket into the certbot
# container so it can run `docker exec nginx nginx -s reload` — but that hands
# certbot full root on the host, a steep price for a reload. Watching the file
# instead costs nothing and needs no extra privileges.

watch_certificates() {
    previous=""
    while :; do
        current=$(cat /etc/letsencrypt/live/*/fullchain.pem 2>/dev/null | md5sum)
        if [ -n "$previous" ] && [ "$current" != "$previous" ]; then
            echo "[cert-watcher] certificate changed on disk — reloading nginx"
            nginx -s reload
        fi
        previous="$current"
        sleep 60
    done
}

echo "[cert-watcher] watching /etc/letsencrypt for certificate changes"
watch_certificates &
