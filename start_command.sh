#!/bin/bash
export DISPLAY=${DISPLAY:-:0}
Xvfb $DISPLAY -ac -screen 0 1024x768x24 -nolisten tcp &
sleep 2
startxfce4 &
sleep 5
x11vnc -bg -display $DISPLAY -forever -wait 50 -shared -rfbport 5900 -nopw -noxdamage -noxfixes -nowf -noscr -ping 1 -repeat -speeds lan &
sleep 2
cd /opt/noVNC/utils && ./novnc_proxy --vnc localhost:5900 --listen 6080 --web /opt/noVNC --heartbeat 30 &
sleep 2
