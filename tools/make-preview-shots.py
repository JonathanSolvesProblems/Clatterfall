"""
Builds preview/ : eight gallery images of the app, for the Devpost submission.

Frames come straight out of the raw screen recordings rather than the demo video, so
they carry no captions, no caption plate and no video compression. Each is cropped to
the game (no browser chrome), then set on the game's own paper board with a one-line
caption in the game's type, so the eight read as one gallery instead of eight
disconnected screenshots.

    python tools/make-preview-shots.py
"""
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 800          # 3:2, which is what Devpost wants
SHOT_H = 640
SHOT_TOP = 34

PAPER = (239, 230, 210)
PAPER_HI = (247, 240, 222)
GRID = (219, 204, 171)
INK = (46, 42, 36)
INK2 = (107, 97, 82)
BRASS = (200, 138, 52)
SHADOW = (176, 160, 130)

F = "C:/Windows/Fonts/"
cap_f = ImageFont.truetype(F + "georgia.ttf", 27)

SRC = Path("broll")
OUT = Path("preview")

# name, source clip, timestamp, crop, caption
#
# Two source framings. The MODAL crop is the game inside the Reddit post, which is how
# a judge will actually meet it, and it carries the HUD: the day, the live depth, the
# record to beat. The FULL crop is the game fullscreen, where the HUD is pinned to the
# far left of a 1920px screen and cropping to the shaft leaves it behind. That is fine
# for the board-and-building shots, where the HUD is not the point, but the opening
# image has to show depth and record, so it is a modal frame.
FULL = "707:1032:587:48"
MODAL = "390:610:766:258"
FEED = "660:560:595:305"

SHOTS = [
    ("01-the-daily-run", "2026-07-14 08-33-21.mp4", 11.5, MODAL,
     "Every morning the whole machine re-runs, and everyone watches the same marble."),
    ("02-the-machine", "broll-02-hero-run-fullscreen.mp4", 16.5, FULL,
     "One machine, built by a whole subreddit, one part at a time."),
    ("03-the-frontier", "2026-07-14 08-19-55.mp4", 12.0, FULL,
     "You can only build where yesterday's marble actually reached."),
    ("04-one-part-a-day", "2026-07-14 08-19-55.mp4", 15.5, FULL,
     "One part per person, per day. Choose it, rotate it, place it."),
    ("05-every-part-is-signed", "2026-07-14 08-38-01.mp4", 48.0, MODAL,
     "Every part is signed, and credited with exactly how far it carried the marble."),
    ("06-new-record", "2026-07-14 08-33-21.mp4", 16.5, MODAL,
     "1,879 px deep. A record the community set together."),
    ("07-the-dissolve", "2026-07-14 08-58-52.mp4", 49.5, MODAL,
     "Parts the marble stops touching dissolve overnight. No vote can save them."),
    ("08-the-post", "2026-07-14 08-54-18.mp4", 118.0, FEED,
     "It lives as one Reddit post that the whole subreddit comes back to."),
]


def board() -> Image.Image:
    """The game's paper board: warm wash, engraved grid."""
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    for y in range(H):
        a = max(0.0, 0.42 - y / H)
        if a <= 0:
            continue
        c = tuple(int(PAPER[i] * (1 - a) + PAPER_HI[i] * a) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=GRID, width=1)
    return img


def frame(clip: str, t: float, crop: str) -> Image.Image:
    png = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(t),
         "-i", str(SRC / clip), "-frames:v", "1",
         "-vf", f"crop={crop}", "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True, check=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(png)).convert("RGB")


OUT.mkdir(exist_ok=True)
for name, clip, t, crop, caption in SHOTS:
    shot = frame(clip, t, crop)
    scale = SHOT_H / shot.height
    shot = shot.resize((round(shot.width * scale), SHOT_H), Image.LANCZOS)

    img = board()
    d = ImageDraw.Draw(img)
    x = (W - shot.width) // 2

    # a soft edge so the screen sits on the board rather than floating on it
    d.rectangle([x - 4, SHOT_TOP - 4, x + shot.width + 5, SHOT_TOP + SHOT_H + 5], fill=SHADOW)
    img.paste(shot, (x, SHOT_TOP))

    # brass rule, then the caption, in the game's serif
    ry = SHOT_TOP + SHOT_H + 34
    d.line([(W / 2 - 150, ry), (W / 2 + 150, ry)], fill=BRASS, width=2)
    tw = d.textlength(caption, font=cap_f)
    d.text(((W - tw) / 2, ry + 22), caption, font=cap_f, fill=INK2)

    p = OUT / f"{name}.png"
    img.save(p)
    print(f"  {p.name:<28} {img.size[0]}x{img.size[1]}  {p.stat().st_size/1024:5.0f} KB")
