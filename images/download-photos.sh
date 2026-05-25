#!/usr/bin/env bash
# Common Ladder — photo downloader
#
# Once you've picked photos from the curated Unsplash searches in
# ../../brand/common-ladder-brand.md, paste their photo IDs below and run:
#
#   ./images/download-photos.sh
#
# Photo ID is the long hash in the Unsplash URL, e.g.
#   https://unsplash.com/photos/abc-XXXXXXXXXX-YYYYYYYYYYYY
#                                  ^^^^^^^^^^^^^^^^^^^^^^^ this part
#
# Format below is: SLOT_PATH|UNSPLASH_PHOTO_ID|WIDTH
# Leave any line blank (no ID) to skip — the site falls back to a brand gradient.

set -euo pipefail
cd "$(dirname "$0")"

SLOTS=(
  "cards/audience-seekers.jpg||800"
  "cards/audience-case-managers.jpg||800"
  "cards/audience-government.jpg||800"
  "cards/audience-donors.jpg||800"
  "cards/shelter.jpg||800"
  "cards/food.jpg||800"
  "cards/healthcare.jpg||800"
  "cards/my-ladder.jpg||800"
  "cards/maricopa.jpg||800"
  "cards/about-mission.jpg||800"
  "cards/about-mobile.jpg||800"
  "cards/about-no-barriers.jpg||800"
  "cards/about-data.jpg||800"
  "hero/homepage.jpg||1600"
  "hero/about.jpg||1600"
  "hero/resources.jpg||1600"
  "hero/garden-planner.jpg||1600"
  "cards/region-northeast.jpg||800"
  "cards/region-southeast.jpg||800"
  "cards/region-midwest.jpg||800"
  "cards/region-southwest.jpg||800"
  "cards/region-mountain.jpg||800"
  "cards/region-pacific.jpg||800"
  "cards/city-nyc.jpg||800"
  "cards/city-la.jpg||800"
  "cards/city-chicago.jpg||800"
  "cards/city-seattle.jpg||800"
  "cards/city-phoenix.jpg||800"
  "cards/city-tucson.jpg||800"
  "cards/all-tools.jpg||800"
)

for entry in "${SLOTS[@]}"; do
  IFS='|' read -r slot id width <<< "$entry"
  if [[ -z "$id" ]]; then
    echo "skip   $slot (no ID set)"
    continue
  fi
  url="https://images.unsplash.com/photo-${id}?w=${width}&q=80&auto=format&fit=crop"
  echo "fetch  $slot"
  curl -sSL "$url" -o "$slot"
done

echo "done."
echo "Remember to update CREDITS.md with photographer names."
