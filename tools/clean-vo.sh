#!/usr/bin/env bash
# Cleans the demo narration and pads it to the length of the cut.
#
# There is a mic puff at 10.36s, in the middle of the word "yesterday's": a burst of
# sub-bass measured at 2.3x the vocal energy around it.
#
# Two things NOT to do here, both learned the hard way:
#
#   1. Do not highpass at 170Hz. His fundamental sits around 110-130Hz, so a 170Hz cut
#      removes his voice rather than the puff — it drops the fundamental by 6dB and the
#      word turns thin and buzzy for a quarter of a second. That artifact is far more
#      noticeable than the puff was.
#   2. Do not switch a filter on with enable='between(t,..)'. Flipping filter state
#      mid-signal is a discontinuity. Run two continuous signals and crossfade instead.
#
# So: a transparent global rumble cut, plus a gentle 130Hz cut crossfaded across a tight
# 160ms window around the puff only. Short and shallow beats wide and deep — a plosive is
# a transient, and 160ms of slightly lighter bass reads as nothing at all.
#
# No second loudnorm: the source is already at -16 LUFS, and re-normalising an already
# normalised track just pumps the noise floor.
#
#   bash tools/clean-vo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=broll/vo-normalised.wav
OUT=broll/vo-final.wav

# the puff window, with 20ms crossfade ramps either side
P0=10.30; P1=10.32
P2=10.44; P3=10.46

# w(t): 0 outside the puff, 1 inside, linear across the ramps
W="min(max((t-${P0})/0.02\,0)\,1)*min(max((${P3}-t)/0.02\,0)\,1)"

ffmpeg -hide_banner -loglevel error -y -i "$SRC" -filter_complex "\
[0:a]highpass=f=85:poles=2,asplit=2[a][b];\
[a]highpass=f=130:poles=2,volume='${W}':eval=frame[wet];\
[b]volume='1-(${W})':eval=frame[dry];\
[wet][dry]amix=inputs=2:weights=1 1:normalize=0,\
alimiter=limit=0.97,apad=pad_dur=3.0[out]" -map "[out]" -c:a pcm_s16le "$OUT"

echo "  $OUT  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s"
