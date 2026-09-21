#!/bin/sh
# Obtains the certificate on first run, then renews it twice a day.
#
# SSL_MODE=selfsigned   -> keep the placeholder written by init.sh, idle.
# SSL_MODE=letsencrypt  -> request a real certificate for DOMAIN, then loop.

set -e

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

idle_forever() {
    # Keeps the container in the stack so switching SSL_MODE is just a restart.
    while :; do
        sleep 1h &
        wait $!
    done
}

if [ "${SSL_MODE}" != "letsencrypt" ]; then
    echo "[certbot] SSL_MODE=${SSL_MODE} — serving the self-signed certificate for ${DOMAIN}."
    echo "[certbot] Browsers will warn. Set SSL_MODE=letsencrypt with a real, publicly"
    echo "[certbot] resolvable DOMAIN to get a trusted certificate."
    idle_forever
fi

if [ -z "${LETSENCRYPT_EMAIL}" ]; then
    echo "[certbot] SSL_MODE=letsencrypt but LETSENCRYPT_EMAIL is empty — refusing to continue."
    echo "[certbot] Set it in .env; Let's Encrypt uses it for expiry warnings."
    idle_forever
fi

case "${DOMAIN}" in
    localhost|127.0.0.1|*.local|"")
        echo "[certbot] DOMAIN=${DOMAIN} is not publicly resolvable — Let's Encrypt cannot"
        echo "[certbot] validate it. Staying on the self-signed certificate."
        idle_forever
        ;;
esac

# The ACME challenge is fetched through nginx, so nginx has to answer first.
echo "[certbot] waiting for nginx to accept connections on port 80..."
attempt=0
until python3 -c "import socket,sys; socket.create_connection(('nginx',80),2)" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "${attempt}" -gt 60 ]; then
        echo "[certbot] nginx never came up — staying on the self-signed certificate."
        idle_forever
    fi
    sleep 2
done
echo "[certbot] nginx is up"

STAGING_ARG=""
if [ "${LETSENCRYPT_STAGING}" = "true" ]; then
    # Staging issues untrusted certificates but has far looser rate limits.
    # Always prove the whole flow works here before switching it off: the
    # production endpoint allows only 5 failures per account per hour.
    echo "[certbot] using the Let's Encrypt STAGING endpoint (certificates will not be trusted)"
    STAGING_ARG="--staging"
fi

# `renewal/<domain>.conf` is what certbot itself writes; its absence means we
# have never issued for this domain, only the placeholder from init.sh.
if [ ! -f "/etc/letsencrypt/renewal/${DOMAIN}.conf" ]; then
    if [ -f "${CERT_DIR}/.selfsigned" ]; then
        echo "[certbot] clearing the self-signed placeholder before issuing"
        rm -rf "${CERT_DIR}" "/etc/letsencrypt/archive/${DOMAIN}"
    fi

    echo "[certbot] requesting a certificate for ${DOMAIN}"
    if certbot certonly \
            --webroot --webroot-path /var/www/certbot \
            --domain "${DOMAIN}" \
            --email "${LETSENCRYPT_EMAIL}" \
            --agree-tos --no-eff-email \
            --non-interactive \
            ${STAGING_ARG}; then
        echo "[certbot] certificate issued — nginx reloads within a minute"
    else
        echo "[certbot] issuance FAILED. Common causes:"
        echo "[certbot]   - DOMAIN does not resolve to this server"
        echo "[certbot]   - port 80 is not reachable from the internet (firewall)"
        echo "[certbot] Restoring a self-signed certificate so nginx keeps serving."
        mkdir -p "${CERT_DIR}"
        openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
            -keyout "${CERT_DIR}/privkey.pem" \
            -out    "${CERT_DIR}/fullchain.pem" \
            -subj   "/CN=${DOMAIN}" \
            -addext "subjectAltName=DNS:${DOMAIN}"
        touch "${CERT_DIR}/.selfsigned"
        idle_forever
    fi
fi

echo "[certbot] entering renewal loop (checks every 12h)"
while :; do
    sleep 12h &
    wait $!
    # A no-op unless the certificate is inside its 30-day renewal window.
    certbot renew --webroot --webroot-path /var/www/certbot --non-interactive
done
