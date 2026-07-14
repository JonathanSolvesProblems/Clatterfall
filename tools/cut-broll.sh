#!/usr/bin/env bash
# Cuts the raw screen recordings into clean, beat-named shots for the demo edit.
#
# Every raw clip is a 1920x1080 screen capture with the game as a narrow column
# surrounded by Reddit chrome. Each shot here is cropped to what actually matters and
# composited over a blurred, darkened copy of the same footage, so the frame fills
# 16:9 in the game's own palette instead of showing browser furniture or black bars.
#
# The clip AUDIO is kept. The marble clacking through the machine is half of why the
# run lands, so the game is mixed in under the narration rather than thrown away.
#
#   bash tools/cut-broll.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=broll
OUT=broll/cut
mkdir -p "$OUT"

# Three source framings, measured from the footage:
#   FULL  -> game fullscreen; the shaft sits at x 647..1234. y=48 skips the title bar.
#   MODAL -> game in the post modal; sits at x 774..1147, y 266..861.
#   FEED  -> the POST CARD in the feed (not the game): x 570..1267, y 58..1079.
#            Cropping this one like a modal slices straight through the copy.
FULL="crop=707:1032:587:48"
MODAL="crop=390:610:766:258"
FEED="crop=700:1020:570:58"

cut() {
  local name="$1" src="$2" in="$3" dur="$4" crop="$5"
  ffmpeg -hide_banner -loglevel error -y \
    -ss "$in" -i "$src" -t "$dur" \
    -filter_complex "\
[0:v]${crop},scale=-2:1080:flags=lanczos,setsar=1[fg];\
[0:v]${crop},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=32,eq=brightness=-0.05:saturation=0.85[bg];\
[bg][fg]overlay=(W-w)/2:0,format=yuv420p" \
    -r 30 -c:v libx264 -preset medium -crf 18 \
    -c:a aac -b:a 192k -ac 2 \
    "$OUT/$name.mp4"
  printf "  %-22s %5.1fs\n" "$name" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.mp4")"
}

echo "cutting shots..."

# 1. COLD OPEN: the marble runs the machine. Fullscreen, the sharpest source.
cut 01-hero-run       "$SRC/broll-02-hero-run-fullscreen.mp4" 13.4 7.5  "$FULL"

# 2. THE RULE: the frontier, tapping a cell, the palette.
cut 02-place-frontier "$SRC/2026-07-14 08-19-55.mp4"          10.0 7.5  "$FULL"

# 3. The machine, steady, as "nobody decides what stays" lands.
#    Taken from broll-02 rather than the pan: the pan was scrolled fast, and a hard
#    scroll under that line is distracting. This one sits still.
cut 03-machine        "$SRC/broll-02-hero-run-fullscreen.mp4" 26.0 5.0  "$FULL"

# 4. THE DISSOLVE. The line no other entry can show.
cut 04-dissolve       "$SRC/2026-07-14 08-58-52.mp4"          47.5 5.5  "$MODAL"

# 5. SIGNED: the popover, a real username and a real px count.
cut 05-signed         "$SRC/2026-07-14 08-38-01.mp4"          45.5 6.5  "$MODAL"

# 6. THE RECORD RUN. In at 8.6, not 8.3: the marble is released at 8.5, and the extra
#    beat of a static board before it drops made the cut feel like it was waiting.
cut 06-record-run     "$SRC/2026-07-14 08-33-21.mp4"           8.6 7.0  "$MODAL"

# 7. NEW RECORD: confetti, and the real names on the board.
cut 07-new-record     "$SRC/2026-07-14 08-33-21.mp4"          15.3 4.0  "$MODAL"

# 8. THE CLOSE: the post card in the feed, built by 3 redditors.
cut 08-feed-card      "$SRC/2026-07-14 08-54-18.mp4"         113.5 7.0  "$FEED"

echo "done -> $OUT"
