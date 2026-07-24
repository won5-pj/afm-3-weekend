# -*- coding: utf-8 -*-
"""Gemini 비주얼 위에 정확한 한글 카피를 정밀 합성 → 최종 1920x1080 썸네일"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
FONT = str(HERE / "fonts" / "BlackHanSans-Regular.ttf")
W, H = 1920, 1080

BASE_DARK = (26, 26, 26)
RED = (255, 45, 45)
WHITE = (255, 255, 255)
YELLOW = (255, 224, 0)
BLACK = (0, 0, 0)


def cover_resize(img, w, h):
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return img.crop((l, t, l + w, t + h))


def line_width(draw, segs, font):
    return sum(draw.textlength(t, font=font) for t, _ in segs)


def draw_line(draw, segs, font, x, y, outline, sw, shadow=None):
    # 0) 그림자
    if shadow:
        cx = x
        for t, _ in segs:
            draw.text((cx + shadow[0], y + shadow[1]), t, font=font,
                      fill=shadow[2], stroke_width=sw, stroke_fill=shadow[2])
            cx += draw.textlength(t, font=font)
    # 1) 아웃라인 (통짜)
    cx = x
    for t, _ in segs:
        draw.text((cx, y), t, font=font, fill=outline, stroke_width=sw, stroke_fill=outline)
        cx += draw.textlength(t, font=font)
    # 2) 컬러 채움
    cx = x
    for t, c in segs:
        draw.text((cx, y), t, font=font, fill=c)
        cx += draw.textlength(t, font=font)


def rounded_pill(draw, xy, radius, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


# ---------- V1: 크림 / 상단 / 검정+빨강 ----------
def make_v1():
    base = cover_resize(Image.open(HERE / "v1_raw.png").convert("RGB"), W, H)
    d = ImageDraw.Draw(base)
    f1 = ImageFont.truetype(FONT, 150)   # 1줄
    f2 = ImageFont.truetype(FONT, 205)   # 펀치라인(더 크게)
    ftag = ImageFont.truetype(FONT, 46)

    # (세그먼트, 폰트) — 핵심 키워드만 강조색
    lines = [
        ([("첫 소개팅부터", BASE_DARK)], f1),
        ([("족발각", RED)], f2),
    ]
    # 상단 중앙 정렬
    y = 40
    for segs, font in lines:
        w = line_width(d, segs, font)
        x = (W - w) / 2
        draw_line(d, segs, font, x, y, outline=WHITE, sw=12,
                  shadow=(0, 6, (180, 180, 180)))
        y += int(font.size * 1.12)

    # 좌상단 태그 pill
    tag = "소개팅 실화"
    tw = d.textlength(tag, font=ftag)
    px, py = 50, 44
    rounded_pill(d, (px, py, px + tw + 60, py + 74), 37, (30, 30, 30))
    d.text((px + 30, py + 12), tag, font=ftag, fill=WHITE)

    out = HERE / "thumbnail_v1.png"
    base.save(out)
    print("V1 저장:", out.name, base.size)


# ---------- V2: 컬러 / 하단 / 흰색+노랑 + 스크림 ----------
def make_v2():
    base = cover_resize(Image.open(HERE / "v2_raw.png").convert("RGB"), W, H).convert("RGBA")
    # 하단 그라데이션 스크림
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    start = int(H * 0.50)
    for yy in range(start, H):
        a = int(205 * (yy - start) / (H - start))
        od.line([(0, yy), (W, yy)], fill=(8, 12, 30, a))
    base = Image.alpha_composite(base, ov).convert("RGB")

    d = ImageDraw.Draw(base)
    f1 = ImageFont.truetype(FONT, 150)   # 1줄
    f2 = ImageFont.truetype(FONT, 205)   # 펀치라인(더 크게)

    lines = [
        ([("첫 소개팅부터", WHITE)], f1),
        ([("족발각", YELLOW)], f2),
    ]
    # 하단 배치 (아래에서 60px 여백)
    y2 = H - 60 - f2.size
    y1 = y2 - int(f1.size * 1.12)
    for (segs, font), y in zip(lines, [y1, y2]):
        w = line_width(d, segs, font)
        x = (W - w) / 2
        draw_line(d, segs, font, x, y, outline=BLACK, sw=13,
                  shadow=(0, 8, (0, 0, 0)))

    out = HERE / "thumbnail_v2.png"
    base.save(out)
    print("V2 저장:", out.name, base.size)


if __name__ == "__main__":
    make_v1()
    make_v2()
