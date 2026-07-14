#!/usr/bin/env bash
# Cuts the same shots as cut-broll.sh, but framed for a 1080x1920 YouTube Short.
#
# This is the format the game actually wants. Clatterfall is a tall portrait shaft, so
# in 16:9 it can only ever be a narrow column with blurred filler either side. Turned
# vertical, the machine fills the frame: the same source crop renders roughly 1.6x
# taller here than it does in the landscape cut.
#
# Writes to broll/cut-v/ so it cannot touch the shots the submission video is built from.
#
#   bash tools/cut-broll-vertical.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=broll
OUT=broll/cut-v
mkdir -p "$OUT"

W=1080
H=1920

# Same source framings as the landscape cut.
FULL="crop=707:1032:587:48"
MODAL="crop=390:610:766:258"
FEED="crop=660:560:595:305"

# Vertical layout: a tag strip at the top, the machine in the middle, a caption plate
# at the bottom. Shorts are watched muted more often than not, so the plate is deeper
# here and the type is bigger than in the landscape cut.
TAG_H=190          # room for the chapter tag
SHOT_H=1400        # the machine
PLATE_TOP=1600     # caption plate runs from here to the bottom
INK="0x2E2A24@0.93"
BRASS="0xC88A34@0.90"

PLATE="drawbox=x=0:y=${PLATE_TOP}:w=${W}:h=$((H - PLATE_TOP)):color=${INK}:t=fill,\
drawbox=x=0:y=$((PLATE_TOP - 3)):w=${W}:h=3:color=${BRASS}:t=fill"

cut() {
  local name="$1" src="$2" in="$3" dur="$4" crop="$5"
  # Fit the shot inside 1080x1400 and centre it in that band; the backdrop is frozen on
  # the first frame, so only the machine moves.
  ffmpeg -hide_banner -loglevel error -y \
    -ss "$in" -i "$src" -t "$dur" \
    -filter_complex "\
[0:v]${crop},scale=${W}:${SHOT_H}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[fg];\
[0:v]${crop},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},\
gblur=sigma=34,eq=brightness=-0.05:saturation=0.85,\
select='eq(n\,0)',loop=loop=-1:size=1:start=0,fps=30,setsar=1[bg];\
[bg][fg]overlay=(W-w)/2:${TAG_H}+(${SHOT_H}-h)/2:shortest=1,${PLATE},format=yuv420p" \
    -r 30 -c:v libx264 -preset medium -crf 18 \
    -c:a aac -b:a 192k -ac 2 \
    "$OUT/$name.mp4"
  printf "  %-22s %5.1fs\n" "$name" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.mp4")"
}

echo "cutting vertical shots..."
cut 01-hero-run       "$SRC/broll-02-hero-run-fullscreen.mp4" 13.4 7.5  "$FULL"
cut 02-place-frontier "$SRC/2026-07-14 08-19-55.mp4"          10.0 7.5  "$FULL"
cut 03-machine        "$SRC/broll-02-hero-run-fullscreen.mp4" 26.0 5.0  "$FULL"
cut 04-dissolve       "$SRC/2026-07-14 08-58-52.mp4"          47.5 5.5  "$MODAL"
cut 05-signed         "$SRC/2026-07-14 08-38-01.mp4"          45.5 6.5  "$MODAL"
cut 06-record-run     "$SRC/2026-07-14 08-33-21.mp4"           8.6 7.0  "$MODAL"
cut 07-new-record     "$SRC/2026-07-14 08-33-21.mp4"          15.3 4.0  "$MODAL"
cut 08-feed-card      "$SRC/2026-07-14 08-54-18.mp4"         113.5 7.0  "$FEED"
echo "done -> $OUT"
