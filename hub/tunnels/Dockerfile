# Habblaud Hub tunnels: one supervised autossh local forward per remote office.
FROM alpine:3.21.3

RUN apk add --no-cache openssh-client-default autossh \
    && adduser -D -H -h /nonexistent -s /sbin/nologin -u 10001 tunnel \
    && mkdir -p /state \
    && chown tunnel:tunnel /state \
    && chmod 700 /state

COPY --chmod=0755 entrypoint.sh /usr/local/bin/tunnels

USER tunnel
# known_hosts lives here (a named volume), so host keys are pinned on first contact and checked afterwards.
VOLUME ["/state"]
ENV TUNNELS_CONF=/etc/habblaud/tunnels.conf \
    TUNNELS_KEY=/keys/id \
    TUNNELS_STATE=/state

ENTRYPOINT ["/usr/local/bin/tunnels"]
