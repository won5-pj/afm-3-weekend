# -*- coding: utf-8 -*-
"""오딧세이 포스터 — 텍스트프리 키아트 위에 한글 타이포 정밀 합성.

- 폰트: BlackHanSans(한글 타이틀 임팩트) / Pretendard Black·ExtraBold(라틴·크레딧)
- 출력: out/poster_A.png (심연/차가움), out/poster_B.png (신을 거스르라/따뜻함)
- 캔버스 1280x1920 (2:3 원시트)
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = pathlib.Path(__file__).parent.parent
FONTS = HERE / "fonts"
RAW = HERE / "raw"
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
W, H = 1280, 1920

# ---- 폰트 ----
_FC = {}
def _f(name, size):
    k = (name, size)
    if k not in _FC:
        _FC[k] = ImageFont.truetype(str(FONTS / name), size)
    return _FC[k]
def bhs(s):   return _f("BlackHanSans-Regular.ttf", s)   # 한글 디스플레이
def blk(s):   return _f("Pretendard-Black.woff2", s)
def xb(s):    return _f("Pretendard-ExtraBold.woff2", s)

# ---- 캐스트/문구 ----
CAST = "맷 데이먼   톰 홀랜드   앤 해서웨이   로버트 패틴슨   루피타 뇽오   젠데이아   샤를리즈 테론"
DIRECTOR = "크리스토퍼 놀란 감독작"
KO_TITLE = "오디세이"
EN_TITLE = "THE ODYSSEY"
TAGLINE = "신을 거스르라"
DATE = "2026. 07. 17"
IMAX = "오직 아이맥스 필름 카메라로 촬영된 영화"


# ---------- 이미지 유틸 ----------
def cover(img, w=W, h=H):
    sw, sh = img.size
    s = max(w / sw, h / sh)
    nw, nh = round(sw * s), round(sh * s)
    img = img.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return img.crop((l, t, l + w, t + h))

def load(tag):
    return cover(Image.open(RAW / f"{tag}.png").convert("RGB")).convert("RGBA")

def grad_scrim(base, edge="bottom", frac=0.30, alpha=190, color=(0, 0, 0)):
    """가장자리에서 안쪽으로 페이드되는 그라데이션 스크림(가독성용)."""
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    if edge in ("bottom", "top"):
        span = int(H * frac)
        for i in range(span):
            a = int(alpha * (1 - i / span))
            y = (H - 1 - i) if edge == "bottom" else i
            od.line([(0, y), (W, y)], fill=color + (a,))
    else:  # left / right
        span = int(W * frac)
        for i in range(span):
            a = int(alpha * (1 - i / span))
            x = (W - 1 - i) if edge == "right" else i
            od.line([(x, 0), (x, H)], fill=color + (a,))
    return Image.alpha_composite(base, ov)

def radial_glow(base, cx, cy, r, alpha=150, color=(0, 0, 0)):
    """타이틀 뒤에 은은한 원형 스크림(중앙 진하고 밖으로 소멸)."""
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    steps = 60
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = int(alpha * (1 - i / steps))
        od.ellipse([cx - rr, cy - rr * 0.62, cx + rr, cy + rr * 0.62], fill=color + (a,))
    ov = ov.filter(ImageFilter.GaussianBlur(30))
    return Image.alpha_composite(base, ov)


# ---------- 텍스트 유틸 ----------
def tw(d, text, f, track):
    return sum(d.textlength(c, font=f) for c in text) + track * max(0, len(text) - 1)

def draw_tracked(d, text, f, x, y, fill, track=0, shadow=None):
    if shadow:
        cx = x
        for c in text:
            d.text((cx + shadow[0], y + shadow[1]), c, font=f, fill=shadow[2])
            cx += d.textlength(c, font=f) + track
    cx = x
    for c in text:
        d.text((cx, y), c, font=f, fill=fill)
        cx += d.textlength(c, font=f) + track

def center_tracked(d, text, f, y, fill, track=0, shadow=None):
    x = (W - tw(d, text, f, track)) / 2
    draw_tracked(d, text, f, x, y, fill, track, shadow)

def title_center(d, text, f, y, fill, track, outline=None, ow=0, shadow=None):
    """중앙정렬 타이틀 — 그림자→아웃라인→채움."""
    width = tw(d, text, f, track)
    x0 = (W - width) / 2
    if shadow:
        cx = x0
        for c in text:
            d.text((cx + shadow[0], y + shadow[1]), c, font=f, fill=shadow[2],
                   stroke_width=ow, stroke_fill=shadow[2])
            cx += d.textlength(c, font=f) + track
    if outline and ow:
        cx = x0
        for c in text:
            d.text((cx, y), c, font=f, fill=outline, stroke_width=ow, stroke_fill=outline)
            cx += d.textlength(c, font=f) + track
    cx = x0
    for c in text:
        d.text((cx, y), c, font=f, fill=fill)
        cx += d.textlength(c, font=f) + track
    return width


# ==================================================================
# STYLE A — 심연 / 차가움 (상단 타이틀 · 하단 개봉정보)
# ==================================================================
COLD_WHITE = (233, 240, 244)
COLD_STEEL = (176, 202, 216)
COLD_RED   = (206, 46, 38)     # 투구 깃털 매칭 포인트

def make_A():
    base = load("a_sea")
    base = grad_scrim(base, "top", frac=0.34, alpha=150, color=(6, 12, 18))
    base = grad_scrim(base, "bottom", frac=0.30, alpha=205, color=(4, 8, 12))
    d = ImageDraw.Draw(base)

    # --- 상단 타이틀 블록 ---
    y = 78
    center_tracked(d, CAST, xb(21), y, (206, 220, 228), track=1.5,
                   shadow=(0, 2, (0, 0, 0)))
    y += 52
    center_tracked(d, DIRECTOR, xb(30), y, COLD_STEEL, track=6,
                   shadow=(0, 2, (0, 0, 0)))
    y += 66
    # 한글 메인 타이틀
    title_center(d, KO_TITLE, bhs(188), y, COLD_WHITE, track=8,
                 shadow=(0, 6, (0, 8, 16)))
    y += 214
    # 영문 서브 타이틀 (와이드 트래킹)
    title_center(d, EN_TITLE, xb(60), y, COLD_STEEL, track=22,
                 shadow=(0, 3, (0, 6, 12)))
    y += 92
    # 태그라인
    center_tracked(d, TAGLINE, xb(34), y, COLD_WHITE, track=10,
                   shadow=(0, 2, (0, 0, 0)))

    # --- 하단 개봉 정보 ---
    yb = H - 150
    title_center(d, DATE, blk(66), yb, COLD_WHITE, track=4, shadow=(0, 3, (0, 0, 0)))
    # 좌우 라인 장식 + IMAX 독점
    center_tracked(d, "I M A X   독 점 개 봉", xb(28), yb + 82, COLD_RED, track=4,
                   shadow=(0, 2, (0, 0, 0)))
    center_tracked(d, IMAX, xb(19), H - 42, (168, 186, 196), track=3)

    out = OUT / "poster_A.png"
    base.convert("RGB").save(out, quality=95)
    print("A 저장:", out.name, base.size)


# ==================================================================
# STYLE B — 신을 거스르라 / 따뜻함 (중앙 태그라인 · 하단 타이틀)
# ==================================================================
WARM_IVORY = (244, 232, 210)
WARM_GOLD  = (226, 176, 92)
WARM_EMBER = (232, 116, 44)
WARM_DARK  = (18, 10, 6)

def make_B():
    base = load("b_gods")
    base = grad_scrim(base, "top", frac=0.18, alpha=155, color=(20, 10, 4))
    base = grad_scrim(base, "bottom", frac=0.50, alpha=242, color=(12, 6, 3))
    d = ImageDraw.Draw(base)

    # --- 상단 캐스트/감독 ---
    y = 66
    center_tracked(d, CAST, xb(21), y, (232, 214, 186), track=1.5,
                   shadow=(0, 2, (0, 0, 0)))
    y += 50
    center_tracked(d, DIRECTOR, xb(29), y, WARM_GOLD, track=6,
                   shadow=(0, 2, (0, 0, 0)))

    # --- 중앙 태그라인 (석상과 전사 사이 다크밴드) ---
    ty = int(H * 0.505)
    base = radial_glow(base, W // 2, ty + 24, 470, alpha=150, color=(10, 5, 2))
    d = ImageDraw.Draw(base)
    center_tracked(d, TAGLINE, xb(45), ty, WARM_IVORY, track=14,
                   shadow=(0, 3, (0, 0, 0)))

    # --- 하단 타이틀 + 개봉정보 (충분한 간격으로 스택) ---
    base = radial_glow(base, W // 2, 1600, 560, alpha=150, color=(8, 4, 2))
    d = ImageDraw.Draw(base)
    title_center(d, KO_TITLE, bhs(150), 1498, WARM_IVORY, track=8,
                 shadow=(0, 5, (0, 0, 0)))          # ~1498–1650
    title_center(d, EN_TITLE, xb(40), 1690, WARM_GOLD, track=20,
                 shadow=(0, 3, (0, 0, 0)))          # ~1690–1735
    title_center(d, DATE, blk(52), 1768, WARM_IVORY, track=4,
                 shadow=(0, 3, (0, 0, 0)))          # ~1768–1822
    center_tracked(d, "I M A X   독 점 개 봉", xb(23), 1836, WARM_EMBER, track=4,
                   shadow=(0, 2, (0, 0, 0)))
    center_tracked(d, IMAX, xb(16), 1884, (198, 176, 150), track=3)

    out = OUT / "poster_B.png"
    base.convert("RGB").save(out, quality=95)
    print("B 저장:", out.name, base.size)


if __name__ == "__main__":
    make_A()
    make_B()
