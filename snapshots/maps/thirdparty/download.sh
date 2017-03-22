#!/usr/bin/env bash

set -e

# Call this script regularly to save the external maps we rely on.

#FIXME: generate this list
maps="12CzQm8VmwpifzQM0FjKL6q8Sx20"

for map_id in $maps; do
  curl -o "${map_id}.kml" "https://www.google.com/maps/d/kml?mid=${map_id}&forcekml=1"
done
