#!/bin/bash
# Collects system stats and writes to stats.json for the dashboard.
# Usage: Run via cron every minute:
#   * * * * * /path/to/backend/stats.sh /path/to/stats.json
#
# If no output path is given, defaults to stats.json next to this script's parent dir.

OUTPUT="${1:-$(dirname "$(dirname "$(readlink -f "$0")")")/stats.json}"

UPTIME=$(uptime -p 2>/dev/null | sed 's/up //')
CPU=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{printf "%.1f", $2+$4}')
MEM_TOTAL=$(free -m 2>/dev/null | awk '/Mem:/ {print $2}')
MEM_USED=$(free -m 2>/dev/null | awk '/Mem:/ {print $3}')
MEM_PCT=$(awk "BEGIN {if ($MEM_TOTAL > 0) printf \"%.1f\", ($MEM_USED/$MEM_TOTAL)*100; else print \"0\"}")
DISK_TOTAL=$(df -BG / 2>/dev/null | awk 'NR==2 {gsub("G",""); print $2}')
DISK_USED=$(df -BG / 2>/dev/null | awk 'NR==2 {gsub("G",""); print $3}')
DISK_PCT=$(df / 2>/dev/null | awk 'NR==2 {gsub("%",""); print $5}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > "${OUTPUT}.tmp"
{
  "uptime": "${UPTIME}",
  "cpu": ${CPU:-0},
  "memory": { "used": ${MEM_USED:-0}, "total": ${MEM_TOTAL:-0}, "percent": ${MEM_PCT:-0} },
  "disk": { "used": ${DISK_USED:-0}, "total": ${DISK_TOTAL:-0}, "percent": ${DISK_PCT:-0} },
  "timestamp": "${TIMESTAMP}"
}
EOF

mv "${OUTPUT}.tmp" "${OUTPUT}"
