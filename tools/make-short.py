"""
Writes the edit plan for the 1080x1920 YouTube Short.

Same narration, same beats, same timings as the submission cut. What changes is the
frame: the machine is a portrait shaft, so vertical is the format it actually wants,
and the type has to carry on a phone held at arm's length. So:

  - captions are bigger (62 vs 50) and break every 3 words instead of 6, because a
    6-word line at that size is ~1550px wide and the canvas is only 1080
  - the caption plate is deeper, since Shorts are watched muted more often than not
  - the outro is the vertical card

The submission cut is untouched: this writes its own plan and reads its own clips.

    python tools/make-short.py
"""
import json
from pathlib import Path

src = json.loads(Path("demo.edit-plan.json").read_text(encoding="utf-8"))

plan = {
    "project_name": "Clatterfall",
    "width": 1080,
    "height": 1920,
    "add_intro_card": False,
    "add_outro_card": False,
    "segments": src["segments"],          # identical beats and timings
    "_transcript": src["_transcript"],
    "_clips_dir": str(Path("broll/cut-v").resolve()),
    "theme": {
        "lower_third": {
            "font": "C:/Windows/Fonts/georgiab.ttf",
            "size": 44,
            "color": "0xD9A24A",
            "box_color": "0x2E2A24@0.92",
            "pad": 20,
            "x": "44",
            "y": "52",
        },
        "captions": {
            "font": "Arial Black",
            "size": 62,
            "spoken": "EFE6D2",
            "active": "F0B44E",
            "outline": "1A150F",
            "back": "00000000",
            "margin_v": 120,
            "margin_h": 50,
            "outline_w": 4,
            "shadow": 0,
            "hold_lines": True,
            "words_per_line": 3,
        },
        "card_fade": 0.45,
    },
}

out = Path("demo-short.edit-plan.json")
out.write_text(json.dumps(plan, indent=2), encoding="utf-8")
print(f"  {out}  {plan['width']}x{plan['height']}  "
      f"{len(plan['segments'])} segments, {plan['segments'][-1]['end_time']:.1f}s")
