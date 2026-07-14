"""
Renders assets/devpost-card.png : the 3:2 thumbnail for the Devpost gallery.

This is NOT the same job as assets/thumbnail.png. That one is pure art, and it is the
right thing for a surface that already sits next to the project's name. The Devpost
gallery card is a grid tile about 300px wide with hundreds of others beside it, and a
wordless picture of some sticks does not tell a judge what this is or why to click. So
the card has to carry the name and the hook, at a size that survives being shrunk to a
thumbnail: one wordmark, one line, nothing else competing.

The machine art bleeds off the left; an ink panel on the right holds the type.

    python tools/make-devpost-card.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 800          # 3:2, what Devpost asks for
PANEL_X = 545             # the ink panel starts here

INK = (46, 42, 36)
PAPER = (239, 230, 210)
PAPER_DIM = (206, 196, 176)
BRASS = (214, 154, 66)

F = "C:/Windows/Fonts/"
mark_f = ImageFont.truetype(F + "georgiab.ttf", 82)
hook_f = ImageFont.truetype(F + "georgiab.ttf", 34)
sub_f = ImageFont.truetype(F + "georgia.ttf", 25)
mono_f = ImageFont.truetype(F + "consola.ttf", 24)

art = Image.open("assets/thumbnail.png").convert("RGB").resize((W, H), Image.LANCZOS)

# Reframe before cropping. The marble sits near the middle of the art, which is exactly
# where the ink panel lands — paste the panel over the art unshifted and you bury the
# one thing the card is about, leaving a half-frame of empty board. So slide the art
# left until the marble and its cascade sit inside the strip that survives.
MARBLE_X = 640          # measured on the 1200x800 art
WANT_X = 350            # where it should land in the visible strip
art = art.crop((MARBLE_X - WANT_X, 0, MARBLE_X - WANT_X + PANEL_X, H))

img = Image.new("RGB", (W, H), INK)
img.paste(art, (0, 0))

# The ink panel. Solid, not translucent: type over a busy board is what makes a
# thumbnail unreadable at grid size.
d = ImageDraw.Draw(img)
d.rectangle([PANEL_X, 0, PANEL_X + 4, H], fill=BRASS)   # brass edge, the depth ruler

x = PANEL_X + 52
y = 168

# wordmark, two-tone, inverted for the dark panel
a, b = "Clatter", "fall"
d.text((x, y), a, font=mark_f, fill=PAPER)
d.text((x + d.textlength(a, font=mark_f), y), b, font=mark_f, fill=BRASS)
y += 122

# brass rule
d.line([(x, y), (x + 300, y)], fill=BRASS, width=2)
for i in range(6):
    d.line([(x + i * 60, y - 6), (x + i * 60, y)], fill=BRASS, width=2)
y += 46

# The hook. This is the line that has to survive being shrunk to a grid tile, so it is
# the biggest thing on the panel after the name.
for line in ["Nobody decides", "what stays.", "The marble does."]:
    d.text((x, y), line, font=hook_f, fill=PAPER)
    y += 44
y += 22

for line in ["A whole subreddit builds one marble", "machine, one part each per day."]:
    d.text((x, y), line, font=sub_f, fill=PAPER_DIM)
    y += 33
y += 20

d.text((x, y), "r/Clatterfall", font=mono_f, fill=BRASS)

out = Path("assets/devpost-card.png")
img.save(out)
print(f"  {out}  {W}x{H}  ratio {W/H:.3f}  {out.stat().st_size/1024:.0f} KB")
