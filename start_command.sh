#!/bin/bash
export DISPLAY=${DISPLAY:-:0}
# Wider 16:10 desktop so it fills the preview pane (was 1024x768 4:3 → letterboxed).
Xvfb $DISPLAY -ac -screen 0 1280x800x24 -nolisten tcp &
sleep 2
# Session dbus so XFCE doesn't error "Unable to contact settings server".
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID
startxfce4 &
sleep 5
x11vnc -bg -display $DISPLAY -forever -wait 50 -shared -rfbport 5900 -nopw -noxdamage -noxfixes -nowf -noscr -ping 1 -repeat -speeds lan &
sleep 2
cd /opt/noVNC/utils && ./novnc_proxy --vnc localhost:5900 --listen 6080 --web /opt/noVNC --heartbeat 30 &
sleep 2
