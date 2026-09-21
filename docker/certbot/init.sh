#!/bin/sh
# Runs once, before nginx starts.
#
# There is a deadlock to break here: nginx refuses to start when
# `ssl_certificate` points at a file that does not exist, and Let's Encrypt
# cannot issue a certificate until nginx is up to serve the ACME challenge on
# port 80.
#
# This script writes a self-signed placeholder so nginx can boot. In
# SSL_MODE=selfsigned that placeholder is the final answer. In
# SSL_MODE=letsencrypt the certbot container replaces it with a real
# certificate a few seconds later.

set -e

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [ -f "${CERT_DIR}/fullchain.pem" ]; then
    echo "[certbot-init] certificate for ${DOMAIN} already on disk — nothing to do"
    exit 0
fi

echo "[certbot-init] no certificate for ${DOMAIN} yet — writing a self-signed placeholder"

mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out    "${CERT_DIR}/fullchain.pem" \
    -subj   "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1"

# Marker the certbot container looks for: it means "this directory holds a
# placeholder, not a real lineage, so it is safe to delete before issuing".
touch "${CERT_DIR}/.selfsigned"

echo "[certbot-init] placeholder ready at ${CERT_DIR}"
