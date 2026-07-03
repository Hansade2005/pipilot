#!/usr/bin/env bash
# Self-starting Expo dev server for the pipilot-expo E2B template. Run as the E2B
# START COMMAND (set in deploy-expo-template.yml via `e2b template build --cmd`), so
# Metro comes up WHILE E2B provisions the sandbox.
#
# CRITICAL: NO --tunnel. `expo start --tunnel` ABORTS the entire process when the ngrok
# tunnel can't connect in time ("CommandError: ngrok tunnel took too long to connect"),
# which leaves :8081 unbound and makes E2B readiness (curl :8081/status) fail for the
# full 10-min window. Plain Metro binds :8081 reliably and serves the react-native-web
# app at :8081/ (exposed via the E2B public host -> the in-app phone frame).
#
# Expo Go (exp://) is derived from the E2B PUBLIC HOST instead of ngrok: the host
# 8081-<sandboxId>.e2b.app proxies :8081 over HTTPS, so Expo Go connects through it with
# no tunnel and no rate limits. api/e2b.mjs knows getHost(8081); here we also best-effort
# publish exp://<host> to /tmp/expUrl and point Metro at it via EXPO_PACKAGER_PROXY_URL.
# NOTE: no CI=1 - CI mode disables Metro's file watcher (kills Fast Refresh).
set -uo pipefail
cd /home/user
rm -f /tmp/expUrl
echo start > /tmp/expo.phase
# If the sandbox exposes its id, make Metro advertise the public E2B host so Expo Go
# connects through the E2B proxy (443 -> :8081) with no ngrok. Best-effort, non-fatal.
SBX="${E2B_SANDBOX_ID:-${SANDBOX_ID:-}}"
if [ -n "$SBX" ]; then
  HOST="8081-${SBX}.e2b.app"
  export EXPO_PACKAGER_PROXY_URL="https://${HOST}"
  echo "exp://${HOST}" > /tmp/expUrl
  echo ready >> /tmp/expo.phase
fi
# Plain Metro (web bundler + LAN). Serves the web app at :8081/ and the manifest for
# Expo Go at the same origin. Stays up for the whole session.
EXPO_NO_TELEMETRY=1 npx expo start --port 8081 > /tmp/expo.log 2>&1 < /dev/null &
wait
