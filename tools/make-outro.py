"""
Renders the demo video's sign-off card in the game's own palette.

vidkit's default outro is a black card with an indigo rule and the word "Thank you",
which looks like a different product. This one is the game: warm paper, the engraved
grid, the two-tone Clatterfall wordmark, the marble, and the brass rule.

    python tools/make-outro.py                 # 1920x1080, for the submission cut
    python tools/make-outro.py --vertical      # 1080x1920, for the YouTube Short

The layout is derived from the canvas rather than hard-coded, so the same card composes
in both aspects instead of being a landscape design squeezed into a phone.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (239, 230, 210)
PAPER_HI = (247, 240, 222)
GRID = (217, 201, 166)
INK = (46, 42, 36)
INK2 = (107, 97, 82)
BRASS = (200, 138, 52)
WOOD = (201, 154, 91)
WOOD_HI = (221, 187, 132)
WOOD_LO = (124, 82, 37)
PIP = (228, 87, 46)
PIP_RIM = (163, 45, 20)
PIP_SPEC = (255, 217, 176)

F = "C:/Windows/Fonts/"

ap = argparse.ArgumentParser()
ap.add_argument("--vertical", action="store_true", help="render 1080x1920 for a Short")
args = ap.parse_args()

if args.vertical:
    W, H = 1080, 1920
    out = Path("broll/cut-v/09-outro.png")
    mark_size, sub_size, mono_size = 104, 34, 30
    grid_step = 54
    mid = 922          # the whole block (motif -> tag) centres on the tall canvas
else:
    W, H = 1920, 1080
    out = Path("broll/cut/09-outro.png")
    mark_size, sub_size, mono_size = 118, 38, 34
    grid_step = 64
    mid = 470          # unchanged: reproduces the card the submission cut already uses

mark_f = ImageFont.truetype(F + "georgiab.ttf", mark_size)
sub_f = ImageFont.truetype(F + "georgia.ttf", sub_size)
mono_f = ImageFont.truetype(F + "consola.ttf", mono_size)

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# warm wash, brighter at the top, like the in-game board
for y in range(H):
    a = max(0.0, 0.45 - y / H)
    if a <= 0:
        continue
    c = tuple(int(PAPER[i] * (1 - a) + PAPER_HI[i] * a) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# engraved grid
for x in range(0, W, grid_step):
    d.line([(x, 0), (x, H)], fill=GRID, width=1)
for y in range(0, H, grid_step):
    d.line([(0, y), (W, y)], fill=GRID, width=1)


def ramp(x1, y1, x2, y2, t=13):
    d.line([(x1 + 3, y1 + 6), (x2 + 3, y2 + 6)], fill=WOOD_LO, width=t, joint="curve")
    d.line([(x1, y1), (x2, y2)], fill=WOOD, width=t, joint="curve")
    d.line([(x1, y1 - 5), (x2, y2 - 5)], fill=WOOD_HI, width=3, joint="curve")


# The card is composed around `mid`, the wordmark's baseline: the motif sits above it,
# the rule and taglines below. Both aspects use the same relative composition.
cx = W // 2

# the motif: a marble mid-cascade, the same three-beat zig-zag as the app icon
ramp(cx - 150, mid - 220, cx - 40, mid - 185)
ramp(cx + 150, mid - 140, cx + 40, mid - 105)
d.ellipse([cx - 116, mid - 292, cx - 66, mid - 242], fill=PIP_RIM)
d.ellipse([cx - 113, mid - 289, cx - 69, mid - 245], fill=PIP)
d.ellipse([cx - 106, mid - 282, cx - 92, mid - 268], fill=PIP_SPEC)

# wordmark: "Clatter" in ink, "fall" in brass, centred as one unit
a, b = "Clatter", "fall"
wa = d.textlength(a, font=mark_f)
wb = d.textlength(b, font=mark_f)
x0 = (W - (wa + wb)) / 2
y0 = mid
d.text((x0, y0), a, font=mark_f, fill=INK)
d.text((x0 + wa, y0), b, font=mark_f, fill=BRASS)

# brass rule, the depth ruler
rule_y = mid + int(mark_size * 1.57)
half = min(300, int(W * 0.32))
d.line([(cx - half, rule_y), (cx + half, rule_y)], fill=BRASS, width=3)
for i in range(-4, 5):
    x = cx + int(i * half / 4)
    d.line([(x, rule_y - 7), (x, rule_y)], fill=BRASS, width=2)

sub = "One community. One machine." if args.vertical else "One community. One machine. One part each, once a day."
d.text(((W - d.textlength(sub, font=sub_f)) / 2, rule_y + 45), sub, font=sub_f, fill=INK2)
if args.vertical:
    sub2 = "One part each, once a day."
    d.text(((W - d.textlength(sub2, font=sub_f)) / 2, rule_y + 90), sub2, font=sub_f, fill=INK2)

tag = "r/Clatterfall"
tag_y = rule_y + (175 if args.vertical else 130)
d.text(((W - d.textlength(tag, font=mono_f)) / 2, tag_y), tag, font=mono_f, fill=BRASS)

out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)
print(f"  {out}  {W}x{H}  {out.stat().st_size/1024:.0f} KB")
