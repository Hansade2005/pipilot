#!/usr/bin/env bash
# Self-starting Expo dev server for the pipilot-expo E2B template. Run as the E2B
# START COMMAND (set in deploy-expo-template.yml via `e2b template build --cmd`), so
# the server comes up WHILE E2B provisions the sandbox. Boots Metro serving BOTH the
# web build (:8081, exposed via the E2B public host → the in-app phone frame) and the
# Expo Go tunnel, then resolves the exp:// URL from the ngrok inspector API and writes
# it to /tmp/expUrl. api/e2b.mjs waits for /tmp/expUrl, maps the user's source in
# (Fast Refresh swaps it), and returns both URLs. NOTE: no CI=1 — CI mode disables
# Metro's file watcher (kills Fast Refresh).
set -uo pipefail
cd /home/user
rm -f /tmp/expUrl
echo start > /tmp/expo.phase
EXPO_NO_TELEMETRY=1 npx expo start --tunnel --port 8081 > /tmp/expo.log 2>&1 < /dev/null &
# Resolve the *.exp.direct tunnel URL (the CLI doesn't print it to non-interactive
# stdout) and publish exp://<host> to /tmp/expUrl.
for i in $(seq 1 150); do
  U=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o 'https://[a-z0-9-]*\.exp\.direct' | head -1)
  if [ -n "$U" ]; then echo "exp:${U#https:}" > /tmp/expUrl; echo ready >> /tmp/expo.phase; break; fi
  sleep 1
done
# Keep the start command alive so Metro (+ the tunnel) stays up for the session.
wait
