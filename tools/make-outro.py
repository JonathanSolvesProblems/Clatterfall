"""
Renders the demo video's sign-off card in the game's own palette.

vidkit's default outro is a black card with an indigo rule and the word "Thank you",
which looks like a different product. This one is the game: warm paper, the engraved
grid, the two-tone Clatterfall wordmark, the marble, and the brass rule.

    python tools/make-outro.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080

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
mark_f = ImageFont.truetype(F + "georgiab.ttf", 118)
sub_f = ImageFont.truetype(F + "georgia.ttf", 38)
mono_f = ImageFont.truetype(F + "consola.ttf", 34)

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# warm wash, brighter top-left, like the in-game board
for y in range(H):
    a = max(0.0, 0.45 - y / H)
    if a <= 0:
        continue
    c = tuple(int(PAPER[i] * (1 - a) + PAPER_HI[i] * a) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# engraved grid
for x in range(0, W, 64):
    d.line([(x, 0), (x, H)], fill=GRID, width=1)
for y in range(0, H, 64):
    d.line([(0, y), (W, y)], fill=GRID, width=1)


def ramp(x1, y1, x2, y2, t=13):
    d.line([(x1 + 3, y1 + 6), (x2 + 3, y2 + 6)], fill=WOOD_LO, width=t, joint="curve")
    d.line([(x1, y1), (x2, y2)], fill=WOOD, width=t, joint="curve")
    d.line([(x1, y1 - 5), (x2, y2 - 5)], fill=WOOD_HI, width=3, joint="curve")


# the motif: a marble mid-cascade, the same three-beat zig-zag as the app icon
cx = W // 2
ramp(cx - 150, 250, cx - 40, 285)
ramp(cx + 150, 330, cx + 40, 365)
d.ellipse([cx - 116, 178, cx - 66, 228], fill=PIP_RIM)
d.ellipse([cx - 113, 181, cx - 69, 225], fill=PIP)
d.ellipse([cx - 106, 188, cx - 92, 202], fill=PIP_SPEC)

# wordmark: "Clatter" in ink, "fall" in brass, centred as one unit
a, b = "Clatter", "fall"
wa = d.textlength(a, font=mark_f)
wb = d.textlength(b, font=mark_f)
x0 = (W - (wa + wb)) / 2
y0 = 470
d.text((x0, y0), a, font=mark_f, fill=INK)
d.text((x0 + wa, y0), b, font=mark_f, fill=BRASS)

# brass rule, the depth ruler
rule_y = 655
d.line([(cx - 300, rule_y), (cx + 300, rule_y)], fill=BRASS, width=3)
for i in range(-4, 5):
    d.line([(cx + i * 75, rule_y - 7), (cx + i * 75, rule_y)], fill=BRASS, width=2)

sub = "One community. One machine. One part each, once a day."
d.text(((W - d.textlength(sub, font=sub_f)) / 2, 700), sub, font=sub_f, fill=INK2)

tag = "r/Clatterfall"
d.text(((W - d.textlength(tag, font=mono_f)) / 2, 785), tag, font=mono_f, fill=BRASS)

out = Path("broll/cut/09-outro.png")
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)
print(f"  {out}  {W}x{H}  {out.stat().st_size/1024:.0f} KB")
