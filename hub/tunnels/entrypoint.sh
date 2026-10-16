#!/bin/sh
# One supervised autossh per line of $TUNNELS_CONF:
#
#   <localPort> <user>@<host>[:<sshPort>] [remotePort=4747]
#   R <remotePort> <user>@<host>[:<sshPort>] <targetHost>:<targetPort>
#
# A plain line becomes `-L 0.0.0.0:<localPort>:127.0.0.1:<remotePort>`: the office is reached on the remote machine's
# own loopback, so Habblaud there still sees a local client. 0.0.0.0 is inside the container only; compose publishes
# the ports on the host's 127.0.0.1.
# An `R` line is a reverse tunnel: `-R 127.0.0.1:<remotePort>:<targetHost>:<targetPort>` makes an office on this side
# (e.g. host.docker.internal:4747, the machine Docker runs on) reachable on the remote machine's loopback, so an
# always-on server can follow it while this machine is up. The remote key needs `permitlisten="127.0.0.1:<port>"`.
set -u
set -f # no globbing when splitting config lines

CONF=${TUNNELS_CONF:-/etc/habblaud/tunnels.conf}
KEY_SRC=${TUNNELS_KEY:-/keys/id}
STATE=${TUNNELS_STATE:-/state}
KEY=/tmp/tunnel-key

log() { printf '%s [tunnels] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 78 # EX_CONFIG
}

[ -f "$CONF" ] || die "no tunnels config at $CONF. Copy hub/tunnels.example.conf to hub/tunnels.conf and edit it."
[ -r "$CONF" ] || die "tunnels config at $CONF is not readable by uid $(id -u)."
[ -f "$KEY_SRC" ] || die "no SSH key at $KEY_SRC. Create one (see hub/README.md) and set HUB_TUNNEL_KEY to its path."
[ -r "$KEY_SRC" ] || die "SSH key at $KEY_SRC is not readable by uid $(id -u)."
[ -w "$STATE" ] || die "$STATE is not writable (known_hosts lives there)."

# ssh refuses a key whose mode is too open, and bind mounts keep the host's owner and mode: use a private copy.
umask 077
cp "$KEY_SRC" "$KEY" || die "could not copy the SSH key to $KEY."
chmod 600 "$KEY"
touch "$STATE/known_hosts"

# Prefix every line of a tunnel's output with its name.
prefix() {
  while IFS= read -r line; do
    printf '%s [%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$line" >&2
  done
}

valid_port() {
  case $1 in '' | *[!0-9]*) return 1 ;; esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

run_tunnel() {
  name=$1 lport=$2 user=$3 host=$4 sshport=$5 rport=$6 mode=${7:-L}
  if [ "$mode" = R ]; then
    fwd="-R 127.0.0.1:$lport:$rport"
    desc="$user@$host:$sshport 127.0.0.1:$lport -> $rport (reverse)"
  else
    fwd="-L 0.0.0.0:$lport:127.0.0.1:$rport"
    desc="localhost:$lport -> $user@$host:$sshport -> 127.0.0.1:$rport"
  fi
  delay=2
  while :; do
    started=$(date +%s)
    log "[$name] connecting: $desc"
    # AUTOSSH_GATETIME (default 30 s): if ssh fails that fast, autossh gives up and this loop backs off.
    # After a connection lived longer, autossh itself restarts ssh when it drops.
    AUTOSSH_LOGFILE=/dev/stderr AUTOSSH_LOGLEVEL=5 \
      autossh -M 0 -N \
      -F none \
      -p "$sshport" \
      -l "$user" \
      -i "$KEY" \
      -o IdentitiesOnly=yes \
      -o IdentityAgent=none \
      -o BatchMode=yes \
      -o PasswordAuthentication=no \
      -o KbdInteractiveAuthentication=no \
      -o StrictHostKeyChecking=accept-new \
      -o UserKnownHostsFile="$STATE/known_hosts" \
      -o GlobalKnownHostsFile=/dev/null \
      -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=3 \
      -o ConnectTimeout=10 \
      -o ExitOnForwardFailure=yes \
      -o ForwardAgent=no \
      -o ForwardX11=no \
      -o PermitLocalCommand=no \
      -o LogLevel=ERROR \
      $fwd \
      "$host" 2>&1 | prefix "$name"
    lived=$(($(date +%s) - started))
    [ "$lived" -ge 60 ] && delay=2
    log "[$name] tunnel down after ${lived}s; retrying in ${delay}s"
    sleep "$delay"
    delay=$((delay * 2))
    [ "$delay" -gt 60 ] && delay=60
  done
}

# Validate the whole file before starting anything, then start one supervisor per line.
specs=""
count=0
lineno=0
ports=" "
# Read once; edit the file and restart the container to apply changes.
while IFS= read -r raw || [ -n "$raw" ]; do
  lineno=$((lineno + 1))
  line=${raw%%#*}
  # shellcheck disable=SC2086
  set -- $line
  [ $# -eq 0 ] && continue
  mode=L
  if [ "$1" = R ]; then
    [ $# -eq 4 ] || die "$CONF line $lineno: expected 'R <remotePort> <user>@<host>[:<sshPort>] <targetHost>:<targetPort>', got: $raw"
    mode=R lport=$2 target=$3 rport=$4
    valid_port "$lport" || die "$CONF line $lineno: bad remote port '$lport'."
    thost=${rport%:*} tport=${rport##*:}
    [ "$thost" != "$rport" ] || die "$CONF line $lineno: target '$rport' needs the form host:port."
    printf '%s' "$thost" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*$' || die "$CONF line $lineno: bad target host '$thost'."
    valid_port "$tport" || die "$CONF line $lineno: bad target port '$tport'."
  else
    if [ $# -lt 2 ] || [ $# -gt 3 ]; then
      die "$CONF line $lineno: expected '<localPort> <user>@<host>[:<sshPort>] [remotePort]', got: $raw"
    fi
    lport=$1 target=$2 rport=${3:-4747}
    valid_port "$lport" || die "$CONF line $lineno: bad local port '$lport'."
    valid_port "$rport" || die "$CONF line $lineno: bad remote port '$rport'."
    case $ports in *" $lport "*) die "$CONF line $lineno: local port $lport is used twice." ;; esac
    ports="$ports$lport "
  fi

  # user@host[:sshPort]; nothing option-looking or exotic reaches ssh.
  user=${target%%@*}
  hostport=${target#*@}
  [ "$user" != "$target" ] && [ -n "$user" ] || die "$CONF line $lineno: '$target' needs the form user@host."
  case $hostport in
    *:*) host=${hostport%:*} sshport=${hostport##*:} ;;
    *) host=$hostport sshport=22 ;;
  esac
  printf '%s' "$user" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9._-]*$' || die "$CONF line $lineno: bad user name '$user'."
  printf '%s' "$host" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*$' || die "$CONF line $lineno: bad host '$host'."
  valid_port "$sshport" || die "$CONF line $lineno: bad SSH port '$sshport'."
  if [ "$mode" = L ] && { [ "$lport" -lt 4801 ] || [ "$lport" -gt 4810 ]; }; then
    log "WARNING: line $lineno: local port $lport is outside 4801-4810, which compose.yml publishes."
  fi

  count=$((count + 1))
  specs="$specs$lport $user $host $sshport $rport $mode
"
done <"$CONF"

if [ "$count" -eq 0 ]; then
  log "no tunnels in $CONF (only comments or blank lines). Nothing to do; idling."
  log "add lines like '4801 user@100.64.0.1' and restart: docker compose restart tunnels"
  trap 'exit 0' TERM INT
  while :; do sleep 3600 & wait $!; done
fi

# A here-document, not a pipe: the supervisors must be children of this shell so `wait` keeps it alive.
while read -r lport user host sshport rport mode; do
  [ -n "$lport" ] && run_tunnel "$mode$lport>$host" "$lport" "$user" "$host" "$sshport" "$rport" "$mode" &
done <<EOF_SPECS
$specs
EOF_SPECS
log "started $count tunnel(s)"
trap 'trap "" TERM INT; log "stopping"; kill -TERM 0 2>/dev/null; exit 0' TERM INT
wait
