#!/usr/bin/env bash
# Checks the studies the way CI does: types, lint, a production build, then
# the overflow and anatomy checks against a server this script starts and
# stops itself.
#
#   .claude/skills/study/scripts/verify.sh              # every study
#   .claude/skills/study/scripts/verify.sh knob fader   # just these
#
# PORT (default 3100) moves the server, SKIP_BUILD=1 reuses .next, and
# CHROMIUM_PATH is passed through to both checks to pick the browser.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
PORT="${PORT:-3100}"
BASE_URL="http://localhost:$PORT/studies"

step() { printf '\n→ %s\n' "$1"; }

# PageProps and LayoutProps are globals that Next generates into .next/types;
# without them a fresh clone fails the type check before it has been built.
step "Route types"
node_modules/.bin/next typegen

step "Type check"
npx tsc --noEmit

step "Lint"
npx eslint src

if [[ "${SKIP_BUILD:-}" != 1 ]]; then
  step "Build"
  npm run build
fi

if curl -sf -o /dev/null "$BASE_URL"; then
  echo "Something is already serving $BASE_URL. Set PORT to a free port." >&2
  exit 1
fi

# next itself, not npm start: npm would put a shell between us and the server,
# and killing the shell would leave the server running.
step "Start the app on port $PORT"
log="$(mktemp)"
node_modules/.bin/next start -p "$PORT" >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; rm -f "$log"' EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "$BASE_URL" && break
  if ! kill -0 "$server" 2>/dev/null; then
    cat "$log" >&2
    echo "The app exited before it was ready." >&2
    exit 1
  fi
  sleep 1
done
if ! curl -sf -o /dev/null "$BASE_URL"; then
  cat "$log" >&2
  echo "The app did not start within 60 s." >&2
  exit 1
fi

step "Overflow check${*:+: $*}"
BASE_URL="$BASE_URL" npm run --silent check:fit -- "$@"

step "Anatomy check${*:+: $*}"
BASE_URL="$BASE_URL" npm run --silent check:anatomy -- "$@"
