#!/bin/sh
set -eu
cd /home/jacen/projects/toyota-dashboard
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/toyota-dashboard-startup.log 2>&1 &
