# Habblaud Hub: the static hub page on a non-root nginx. Build context: this folder (hub/).
FROM nginxinc/nginx-unprivileged:1.27.5-alpine

USER root

# Our server block replaces the image's default one.
COPY --chown=root:root nginx/hub.conf /etc/nginx/conf.d/default.conf
COPY --chown=root:root nginx/headers.conf /etc/nginx/hub/headers.conf
COPY --chown=root:root public/ /usr/share/nginx/html/

# config.json is mounted read-only at runtime (see compose.yml); never baked into the image.
RUN rm -f /usr/share/nginx/html/config.json /usr/share/nginx/html/50x.html \
    && chmod -R a+rX,go-w /usr/share/nginx/html /etc/nginx/hub

# The image's unprivileged nginx user.
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
