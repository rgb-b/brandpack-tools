#!/bin/bash
# swap-port.sh — swap which brandpack version is on port 8080
# Usage: sudo ./swap-port.sh

MAIN_ENV="/home/el/Documents/El-Projects/brandpack-tools/server/.env"
REDESIGN_ENV="/home/el/Documents/El-Projects/brandpack-tools-redesign/server/.env"

MAIN_PORT=$(grep '^PORT=' "$MAIN_ENV" | cut -d= -f2)

if [ "$MAIN_PORT" = "8080" ]; then
    sed -i 's/^PORT=8080/PORT=8081/' "$MAIN_ENV"
    sed -i 's/^PORT=8081/PORT=8080/' "$REDESIGN_ENV"
    systemctl restart brandpack-tools
    systemctl restart brandpack-tools-redesign
    echo "Swapped: redesign is now on :8080, current is on :8081"
else
    sed -i 's/^PORT=8081/PORT=8080/' "$MAIN_ENV"
    sed -i 's/^PORT=8080/PORT=8081/' "$REDESIGN_ENV"
    systemctl restart brandpack-tools
    systemctl restart brandpack-tools-redesign
    echo "Swapped: current is now on :8080, redesign is on :8081"
fi
