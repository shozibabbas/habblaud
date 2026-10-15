# Habblaud Hub

One page for several Habblaud offices. If you run Claude Code on more than one computer (a laptop and a couple of
servers, say), each one runs its own Habblaud, and the hub shows them all as tiles, like a video call:

- **Grid**: every office the same size, arranged to fill the window with tiles close to 16:10.
- **Spotlight**: one office large, with the full Habblaud interface, and the others in a strip on the right (or along
  the bottom when the window is tall and narrow).
- **Auto-spotlight**: when an agent on any computer starts waiting for you, that office moves into the spotlight (unless
  you used the hub in the last 20 seconds), its border pulses, and you can get a desktop alert. The window title shows
  how many agents are waiting, e.g. `(2) Habblaud Hub`.
- **Installable**: add it to your launcher or Dock and it opens in its own window.

The hub is a static page (plain HTML, CSS and JavaScript, no build step) in a small nginx container, plus an optional
container that keeps SSH tunnels to the remote offices open.

```
 this computer                                         remote computer (one per tunnel line)
┌────────────────────────────────────────────┐        ┌───────────────────────────────┐
│ browser or installed app                   │        │                               │
│  http://localhost:4700  (hub page)         │        │  Habblaud on 127.0.0.1:4747   │
│   ├─ iframe localhost:4747 → own Habblaud  │        │              ▲                │
│   ├─ iframe localhost:4801 ─┐              │        │              │ loopback       │
│   └─ iframe localhost:4802  │              │        │              │                │
│                             ▼              │  SSH   │              │                │
│  tunnels container on 127.0.0.1:4801 ──────┼────────┼──► sshd ─────┘                │
└────────────────────────────────────────────┘        └───────────────────────────────┘
```

## Security model

Habblaud reads your Claude Code transcripts, and when it's opened on `localhost` it can also show a terminal, answer
permission requests and send messages to your sessions. So:

- **Every office stays bound to its own loopback** (`127.0.0.1:4747`, the default). Never publish an office on
  `0.0.0.0` or on a mesh/VPN address for the hub's sake.
- **Remote offices are reached through SSH local forwards** that land on the remote machine's `127.0.0.1`. To the
  remote Habblaud, the hub's requests come from its own loopback, so its local-only features keep working, and nothing
  new listens on the network.
- **Everything the hub publishes is on `127.0.0.1` only**: the page on port 4700 and the tunnels on 4801–4810. Don't
  change those bindings: anyone who can reach those ports can use the offices behind them.
- **Use a dedicated tunnel key** (not your personal `~/.ssh` key), and restrict it on each remote machine so it can
  only open a forward to the office port: no shell, no other ports, no agent or X11 forwarding:

  ```
  restrict,port-forwarding,permitopen="127.0.0.1:4747",command="/usr/sbin/nologin" ssh-ed25519 AAAA... habblaud-hub
  ```

  `restrict` turns everything off, `port-forwarding` turns local forwards back on, `permitopen` limits them to the
  office, and `command` makes sure an interactive login can't run anything. The tunnels use `ssh -N`, which never asks
  for a command anyway.
- **Host keys are pinned** on first contact (`StrictHostKeyChecking=accept-new`) and checked on every reconnect;
  they are kept in a Docker volume.
- **The hub page itself** sends a strict Content-Security-Policy: scripts, styles and images only from itself, and
  frames only from `http://localhost:*` and `http://127.0.0.1:*`. It answers only to the host names `localhost`,
  `127.0.0.1` and `[::1]` (anything else gets `421`), which blocks DNS-rebinding pages from reading it.
- **The embed messages** (see [Embed mode](../README.md#embed-mode)) carry counters only, no names, paths or text. The
  hub accepts a message only when it comes from that tile's own iframe *and* from the office URL's origin.
- Each office must explicitly allow the hub to frame it with `HABBLAUD_FRAME_ANCESTORS`; without it, it refuses.
- Both containers run as non-root users with a read-only filesystem, no Linux capabilities and `no-new-privileges`.

## Setup

You need Docker (Docker Desktop on macOS) on the computer where you'll look at the hub, and SSH access to each remote
computer. In the examples, the remote computers are `100.64.0.1` and `100.64.0.2` (mesh/VPN addresses work well) and
the SSH user is `user`; use your own.

### 1. Let each office be framed by the hub

On **every** computer whose office the hub shows (including this one), add the hub's origins to Habblaud's settings
and restart it. With Docker, in the repository's `.env`:

```bash
HABBLAUD_FRAME_ANCESTORS=http://localhost:4700 http://127.0.0.1:4700
```

then `npm run docker:up -- --no-build`. With Node, set the same variable before `npm start`. Keep `HABBLAUD_BIND`
(Docker) / `HABBLAUD_HOST` (Node) at their loopback defaults.

### 2. Create the tunnel key (on this computer)

```bash
mkdir -p ~/.config/habblaud && ssh-keygen -t ed25519 -N '' -C habblaud-hub -f ~/.config/habblaud/tunnel_ed25519
```

The key has no passphrase because the tunnels reconnect on their own; the `authorized_keys` restrictions below are what
make that acceptable. Keep it readable only by you (`ssh-keygen` already does).

### 3. Authorize it on each remote computer

Append one line to the SSH user's `~/.ssh/authorized_keys` on each remote computer, with the contents of
`~/.config/habblaud/tunnel_ed25519.pub` after the options:

```
restrict,port-forwarding,permitopen="127.0.0.1:4747",command="/usr/sbin/nologin" ssh-ed25519 AAAA... habblaud-hub
```

The remote `sshd` must allow TCP forwarding (`AllowTcpForwarding yes` or `local`; that's the default on most
distributions, but some hardened setups and Alpine turn it off).

### 4. Configure the hub

```bash
cd hub
cp config.example.json config.json
cp tunnels.example.conf tunnels.conf
```

`tunnels.conf` has one line per remote office:

```
# <localPort> <user>@<host>[:<sshPort>] [remotePort=4747]
4801 user@100.64.0.1
4802 user@100.64.0.2
```

`config.json` lists the tiles, in order (keys 1–9 follow this order):

```json
{
  "title": "Habblaud Hub",
  "offices": [
    { "id": "laptop", "name": "Laptop", "url": "http://localhost:4747" },
    { "id": "server-1", "name": "Server 1", "url": "http://localhost:4801" },
    { "id": "server-2", "name": "Server 2", "url": "http://localhost:4802" }
  ]
}
```

Both files are ignored by git.

### 5. Start it

```bash
docker compose -f hub/compose.yml up -d --build
docker compose -f hub/compose.yml logs -f tunnels
```

The tunnels container connects from this computer's network, so mesh/VPN addresses that work in your terminal work
there too (on Docker Desktop, container traffic leaves through the host). The tunnel log shows one prefixed line per
tunnel as it connects, and why it failed if it does (it retries with a
growing delay, up to a minute). Open **http://localhost:4700**.

This computer's own office is not part of this compose file; it keeps running from the repository root
(`npm run docker:up`). If you only want the page (no remote offices), start just that service:
`docker compose -f hub/compose.yml up -d --build hub`.

### 6. Install it as an app

- **Chrome / Edge**: the install icon at the right of the address bar (or ⋮ › Cast, save and share › Install page as
  app). It opens in its own window and can be pinned to the Dock, taskbar or launcher.
- **Safari (macOS Sonoma or later)**: File › Add to Dock.

## Using it

| Action | How |
| --- | --- |
| Spotlight an office | Click its label bar, or press `1`–`9` |
| Back to the grid | Click the spotlighted office's label, or press `Esc` or `G` |
| Full screen | Double-click a label, or the ⤢ button on it |
| Open an office on its own | The ↗ button on its label |
| Desktop alerts | **Enable alerts** in the top bar (the browser asks once); click again to turn them off or on |
| Auto-spotlight | The switch in the top bar; remembered in this browser |

Tiles stay put in the page: switching layouts only moves and resizes them, so the offices never reload. The spotlighted
office shows the full Habblaud interface; the others show just the building.

The dot on each label tells you how the office is doing:

| Dot | Meaning |
| --- | --- |
| green | The office is reporting. |
| amber, *reconnecting* | No report for 15 s, or the office lost its own connection to its server. |
| amber, *no status* | The page loaded but doesn't report: an older Habblaud without embed mode, or `HABBLAUD_FRAME_ANCESTORS` isn't set there (the tile then shows the browser's "refused to connect" page). |
| red, *offline* | Nothing answers on that port. The tile shows a **Retry** button and checks again on its own every 5–30 s. |

## Configuration reference

Environment variables for `docker compose` (in the shell or in `hub/.env`):

| Variable | Default | What for |
| --- | --- | --- |
| `HUB_PORT` | `4700` | Port of the hub page on `127.0.0.1`. If you change it, change `HABBLAUD_FRAME_ANCESTORS` on every office too. |
| `HUB_CONFIG` | `./config.json` | The tile list. |
| `HUB_TUNNELS_CONF` | `./tunnels.conf` | The tunnel list. |
| `HUB_TUNNEL_KEY` | `~/.config/habblaud/tunnel_ed25519` | Private key for the tunnels (mounted read-only). |

`compose.yml` publishes tunnel ports 4801–4810. For more offices, widen that range in `compose.yml`.

An office URL must be `http://localhost:<port>` or `http://127.0.0.1:<port>`: the hub's policy refuses to frame
anything else, on purpose. A path or query in the URL is kept (`http://localhost:4747/?mock=1` shows demo data).

## Troubleshooting

**`Host key verification failed`** in the tunnel log after reinstalling a remote computer: its SSH host key changed.
If you expected that, forget the pinned keys and restart:
`docker compose -f hub/compose.yml down && docker volume rm habblaud-hub_tunnels-state && docker compose -f hub/compose.yml up -d`.

**`Permission denied (publickey)`**: the `authorized_keys` line is missing or the key doesn't match
`HUB_TUNNEL_KEY`.

**`administratively prohibited`** or the tile stays offline although the tunnel is up: the remote `sshd` doesn't allow
forwarding (see step 3), or the office isn't on `127.0.0.1:4747` there (set the right `remotePort`).

**The tunnels container restarts over and over**: it exits when `tunnels.conf` or the key is missing or a line is
invalid; `docker compose -f hub/compose.yml logs tunnels` says which. An empty `tunnels.conf` is fine.

**`docker compose up` says a bind source path doesn't exist**: create `config.json` / `tunnels.conf` (step 4) or the
key (step 2). The compose file refuses to start rather than create empty folders in their place.

**Trying the page without Docker**: any static server works for a quick look, e.g.
`python3 -m http.server -d hub/public 4700` after copying your `config.json` into `hub/public/` (don't commit it). You
lose the security headers, so use the container for daily use.

## Files

| Path | What |
| --- | --- |
| `public/` | The hub page: `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js` (caches the page itself, never the offices), `icons/`. |
| `nginx/` | Server block and security headers. |
| `Dockerfile` | The page on a non-root nginx. |
| `tunnels/` | The tunnels image: Alpine with OpenSSH and autossh, and the supervisor script. |
| `compose.yml` | Both services, published on `127.0.0.1` only. |
| `config.example.json`, `tunnels.example.conf` | Templates for the real, git-ignored files. |
