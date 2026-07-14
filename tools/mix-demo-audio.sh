#!/usr/bin/env bash
# Builds the demo's final soundtrack: the narration, with the GAME audible underneath.
#
# vidkit only lays down the voiceover. But the marble clacking its way through wood
# and brass is half the reason the run lands at all, and a silent machine looks like a
# mockup. So this rebuilds the game's own audio on the same timeline as the cut and
# ducks it under the voice with a sidechain compressor: you hear the machine
# throughout, and it steps back automatically whenever he speaks.
#
#   bash tools/mix-demo-audio.sh <silent_render.mp4> <narration.wav> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/.."

VID="${1:-demo.raw.mp4}"
VO="${2:-broll/vo-final.wav}"
OUT="${3:-demo.mp4}"
PLAN=demo.edit-plan.json
CUT=broll/cut
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Rebuild the game audio on the edit's timeline: each segment contributes its clip's
# audio, from the clip's start, trimmed to exactly the segment's length.
python - "$PLAN" "$CUT" "$TMP" <<'PY'
import json, subprocess, sys
from pathlib import Path
plan_p, cut_d, tmp = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
plan = json.loads(plan_p.read_text(encoding="utf-8"))
parts = []
for i, seg in enumerate(plan["segments"]):
    dur = round(seg["end_time"] - seg["start_time"], 3)
    src = cut_d / f"{seg['clip_id']}.mp4"
    out = tmp / f"a{i:02d}.wav"
    if src.exists():
        # the clip's own audio, trimmed to the segment
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(src),
                        "-t",str(dur),"-vn","-ac","2","-ar","48000","-c:a","pcm_s16le",str(out)],check=True)
    else:
        # a still (the outro card) has no audio: lay down silence so timing holds
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","lavfi",
                        "-i",f"anullsrc=r=48000:cl=stereo","-t",str(dur),
                        "-c:a","pcm_s16le",str(out)],check=True)
    parts.append(out)
(tmp/"list.txt").write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
print(f"  game bed: {len(parts)} segments")
PY

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" \
  -ac 2 -ar 48000 -c:a pcm_s16le "$TMP/game-bed.wav"

echo "  game bed: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/game-bed.wav")s"
echo "  narration: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VO")s"

# Mix.
#
# The game audio in these screen recordings is VERY quiet (about -40 dB where it
# exists at all), so it gets a big fixed lift rather than loudnorm — loudnorm on a
# mostly-silent bed just pumps up the room tone between the clacks.
#
# The sidechain compressor then keys the bed off the voice: the machine plays at a
# real level on its own (the cold open is carried by it), and steps back about 9 dB
# the moment he starts speaking.
#
# NOTE: only the cold open and the placement beat actually captured any game sound.
# The browser's audio never unlocked while the other takes were recorded, so those
# segments are genuinely silent and there is nothing there to raise.
#
# The 5.8dB make-up after amix is not taste: amix scales every input by
# weight/sum(weights), so folding the bed in costs the narration 5.3dB. A flat gain
# puts the whole mix back on the -16 LUFS target without touching the balance
# between the two, which is what loudnorm here would get wrong.
ffmpeg -hide_banner -loglevel error -y \
  -i "$VID" -i "$VO" -i "$TMP/game-bed.wav" \
  -filter_complex "\
[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[vo][key];\
[2:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,\
highpass=f=110,volume=18dB,alimiter=limit=0.7[bed];\
[bed][key]sidechaincompress=threshold=0.035:ratio=6:attack=12:release=420:makeup=1[ducked];\
[vo][ducked]amix=inputs=2:duration=first:dropout_transition=0:weights=1.0 0.85,\
volume=5.8dB,alimiter=limit=0.96[mix]" \
  -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "  -> $OUT  ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
