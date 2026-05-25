#!/usr/bin/env bash
# Common Ladder — photo downloader
#
# Fetches curated Unsplash photos into images/cards/ and images/hero/.
# Run from the repo root or anywhere:
#
#   bash images/download-photos.sh
#
# The Unsplash short ID is the 11-character hash at the END of a photo's URL:
#   https://unsplash.com/photos/holding-house-keys-in-front-of-the-entrance-bqUZEAeWuok
#                                                                            ^^^^^^^^^^^ this
#
# Empty ID = slot skipped (site falls back to the brand gradient).
# Update CREDITS.md when you fill or change a slot.

set -euo pipefail
cd "$(dirname "$0")"

# Make sure the target directories exist — git doesn't track empty dirs.
mkdir -p cards hero

# Format: "PATH|SHORT_ID|WIDTH"
SLOTS=(
  # --- Audience cards (homepage) ---
  "cards/audience-seekers.jpg|Oo3b4wO1YXk|800"        # Jordan Bauer — woman on porch in front of house
  "cards/audience-case-managers.jpg|aoweP90-XwM|800"  # two women talking at a desk
  "cards/audience-government.jpg|MjH55Ef3w_0|800"     # small-town main street at dusk
  "cards/audience-donors.jpg|iE1JftOiYec|800"         # group of people holding plants

  # --- Most-needed resources (homepage) ---
  "cards/shelter.jpg|bqUZEAeWuok|800"                 # Jakub Żerdzicki — house keys at entrance
  "cards/food.jpg|eS_Y2MFncjo|800"                    # Douglas Fehr — woman stirring pot with wooden spoon
  "cards/healthcare.jpg|UXlVU1RUe3g|800"              # Ben Iwara — nurse talking to patient in hospital room

  # --- Tools (homepage) ---
  "cards/my-ladder.jpg|zH1Mqf6ojwU|800"               # woman on sidewalk with smartphone
  "cards/maricopa.jpg||800"                           # TODO: Phoenix sunrise neighborhood — https://unsplash.com/s/photos/phoenix-arizona

  # --- About page cards ---
  "cards/about-mission.jpg|xLp62xg7Flg|800"           # Maximilian Bungart — person walking up stairs
  "cards/about-mobile.jpg|gwM13cGny6g|800"            # Miguelangel Perez — woman with smartphone outdoors
  "cards/about-no-barriers.jpg|1dnMXxhJT_g|800"       # Greg Rosenke — open door with light coming in
  "cards/about-data.jpg|wl2qQ2JHMXA|800"              # notebook, pen, coffee on wooden desk

  # --- City navigator cards (resources page) ---
  "cards/city-nyc.jpg||800"                           # TODO: https://unsplash.com/s/photos/brooklyn-brownstone
  "cards/city-la.jpg|uGxYDsI8psw|800"                 # row of palm trees on city street
  "cards/city-chicago.jpg||800"                       # TODO: https://unsplash.com/s/photos/chicago-neighborhood
  "cards/city-seattle.jpg||800"                       # TODO: https://unsplash.com/s/photos/seattle
  "cards/city-phoenix.jpg||800"                       # TODO: https://unsplash.com/s/photos/phoenix-az
  "cards/city-tucson.jpg||800"                        # TODO: https://unsplash.com/s/photos/tucson
  "cards/all-tools.jpg|9PXnqrIKYW8|800"               # Zoshua Colah — corkboard with flyers

  # --- Heroes (16:9, larger) ---
  "hero/homepage.jpg||1600"                           # TODO: https://unsplash.com/s/photos/sunrise-street
  "hero/about.jpg||1600"                              # TODO: https://unsplash.com/s/photos/community-meeting
  "hero/resources.jpg|ufRqsiLaKII|1600"               # bulletin board covered with flyers
  "hero/garden-planner.jpg||1600"                     # TODO: https://unsplash.com/s/photos/hands-in-soil

  # --- Garden Planner regional photos ---
  "cards/region-northeast.jpg||800"                   # TODO: https://unsplash.com/s/photos/brownstone-garden
  "cards/region-southeast.jpg||800"                   # TODO: https://unsplash.com/s/photos/florida-garden
  "cards/region-midwest.jpg||800"                     # TODO: https://unsplash.com/s/photos/community-garden
  "cards/region-southwest.jpg||800"                   # TODO: https://unsplash.com/s/photos/desert-garden
  "cards/region-mountain.jpg||800"                    # TODO: https://unsplash.com/s/photos/colorado-garden
  "cards/region-pacific.jpg||800"                     # TODO: https://unsplash.com/s/photos/pacific-northwest-garden
)

errors=0
filled=0
skipped=0
gated=()

for entry in "${SLOTS[@]}"; do
  IFS='|' read -r slot id width <<< "$entry"
  if [[ -z "$id" ]]; then
    echo "skip   $slot (no ID set)"
    skipped=$((skipped + 1))
    continue
  fi
  # Unsplash's public /download endpoint redirects to the actual JPEG.
  # User-Agent header keeps Unsplash from returning HTML instead of redirecting.
  url="https://unsplash.com/photos/${id}/download?force=true&w=${width}&fm=jpg"
  echo "fetch  $slot   (id: ${id})"
  http_code=$(curl -sSL -A "Mozilla/5.0 commonladder-fetcher" \
                   -o "$slot" -w "%{http_code}" "$url" || echo "000")
  if [[ "$http_code" == "200" ]] && [[ -s "$slot" ]]; then
    size=$(wc -c < "$slot")
    echo "       ✓ ${size} bytes"
    filled=$((filled + 1))
  else
    echo "       ✗ HTTP ${http_code} — photo may be Unsplash+ / gated; remove or replace ID"
    rm -f "$slot"
    gated+=("$slot ($id)")
    errors=$((errors + 1))
  fi
done

echo ""
echo "=== Summary ==="
echo "  filled:  $filled"
echo "  skipped: $skipped (no ID — fill in the SLOTS array)"
echo "  errors:  $errors"
if (( ${#gated[@]} > 0 )); then
  echo ""
  echo "Gated / failed photos (need replacement IDs):"
  for g in "${gated[@]}"; do echo "  - $g"; done
fi
echo ""
echo "Update CREDITS.md with photographer names. Then commit images/ and push."
