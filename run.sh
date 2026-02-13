#!/bin/bash
set -e; cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
screen -dmS formbot -t formbot bash -c "node server; read"