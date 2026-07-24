# -*- coding: utf-8 -*-
"""컴포즈커피 광고카드 공용 디자인 시스템 (1080x1080)

- 팔레트: Compose Yellow #FFD902 / Charcoal #2B2B2B / Cream base
- 폰트: Pretendard Black(헤드라인) / ExtraBold(서브·CTA·워드마크)
- 공용 요소: 워드마크, 키워드 하이라이트 마커, CTA 필, 캐러셀 도트, 여백 그리드
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent.parent
FONTS = HERE / "fonts"
W = H = 1080

# ---- 팔레트 ----
YELLOW = (255, 217, 2)      # #FFD902 브랜드 시그니처
CHARCOAL = (43, 43, 43)     # #2B2B2B 다크그레이(리브랜딩 대비색)
INK = (34, 31, 27)          # 헤드라인용 웜 블랙
WHITE = (255, 255, 255)
MUTED = (120, 112, 98)      # 보조 텍스트(웜 그레이)

MARGIN = 92                 # 좌우 안전 여백

_FCACHE = {}
def font(name, size):
    key = (name, size)
    if key not in _FCACHE:
        _FCACHE[key] = ImageFont.truetype(str(FONTS / name), size)
    return _FCACHE[key]

def black(size):    return font("Pretendard-Black.woff2", size)
def xbold(size):    return font("Pretendard-ExtraBold.woff2", size)


# ---------- 이미지 ----------
def cover(img, w=W, h=H):
    sw, sh = img.size
    s = max(w / sw, h / sh)
    nw, nh = round(sw * s), round(sh * s)
    img = img.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return img.crop((l, t, l + w, t + h))

def load_bg(tag):
    return cover(Image.open(HERE / "raw" / f"{tag}.png").convert("RGB")).convert("RGBA")

def soft_top_scrim(base, to_y=0.5, alpha=70, color=(252, 248, 238)):
    """상단 여백 위 텍스트 가독성을 위한 아주 옅은 크림 스크림(위→아래 페이드)."""
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    end = int(H * to_y)
    for y in range(0, end):
        a = int(alpha * (1 - y / end))
        od.line([(0, y), (W, y)], fill=color + (a,))
    return Image.alpha_composite(base, ov)

def soft_side_scrim(base, side="right", frac=0.55, alpha=90, color=(252, 248, 238)):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    span = int(W * frac)
    for i in range(span):
        a = int(alpha * (1 - i / span))
        x = (W - 1 - i) if side == "right" else i
        od.line([(x, 0), (x, H)], fill=color + (a,))
    return Image.alpha_composite(base, ov)


# ---------- 텍스트 유틸 ----------
def tracked_width(d, text, f, track):
    return sum(d.textlength(c, font=f) for c in text) + track * max(0, len(text) - 1)

def draw_tracked(d, text, f, x, y, fill, track=0):
    cx = x
    for c in text:
        d.text((cx, y), c, font=f, fill=fill)
        cx += d.textlength(c, font=f) + track
    return cx

def line_h(size):
    return int(size * 1.16)


def wordmark(d, cx_center=None, y=72, size=34, fill=CHARCOAL, x_left=None):
    """COMPOSE ● COFFEE 워드마크 (트래킹 + 원형 엠블럼)."""
    f = xbold(size)
    tr = size * 0.14
    left = "COMPOSE"
    right = "COFFEE"
    gap = size * 0.55
    dot_r = int(size * 0.20)
    wl = tracked_width(d, left, f, tr)
    wr = tracked_width(d, right, f, tr)
    total = wl + gap + dot_r * 2 + gap + wr
    x = x_left if x_left is not None else (cx_center - total / 2)
    x = draw_tracked(d, left, f, x, y, fill, tr)
    x += gap
    cyc = y + size * 0.52
    d.ellipse([x, cyc - dot_r, x + dot_r * 2, cyc + dot_r], fill=fill)
    x += dot_r * 2 + gap
    draw_tracked(d, right, f, x, y, fill, tr)
    return total


def eyebrow(d, text, x, y, size=30, fill=None, track=None):
    fill = fill if fill else MUTED
    f = xbold(size)
    tr = size * 0.22 if track is None else track
    draw_tracked(d, text.upper(), f, x, y, fill, tr)
    return line_h(size)


def fit_headline(lines, max_w, start, min_size=64):
    """모든 줄이 max_w 안에 들어오는 최대 폰트 크기 탐색. lines=[[(seg,hl),...],...]"""
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    size = start
    while size > min_size:
        f = black(size)
        ok = True
        for segs in lines:
            w = sum(d.textlength(t, font=f) for t, _ in segs)
            if w > max_w:
                ok = False
                break
        if ok:
            return size
        size -= 3
    return min_size


def draw_headline(d, lines, x, y, size, ink=INK, hl=YELLOW, hl_text=None, gap_ratio=1.14):
    """하이라이트 키워드에는 마커를 뒤에 깔고 텍스트를 얹는다.
    hl=마커색, hl_text=하이라이트 글자색(None이면 ink). 옐로우 카드는 hl=차콜/hl_text=흰색."""
    f = black(size)
    asc, desc = f.getmetrics()
    lh = int(size * gap_ratio)
    cy = y
    for segs in lines:
        # 1) 하이라이트 마커
        cx = x
        for t, is_hl in segs:
            tw = d.textlength(t, font=f)
            if is_hl:
                pad_x = int(size * 0.10)
                top = cy + int(size * 0.10)
                bot = cy + asc + int(desc * 0.35)
                d.rounded_rectangle([cx - pad_x, top, cx + tw + pad_x, bot],
                                    radius=int(size * 0.16), fill=hl)
            cx += tw
        # 2) 텍스트
        cx = x
        for t, is_hl in segs:
            col = hl_text if (is_hl and hl_text) else ink
            d.text((cx, cy), t, font=f, fill=col)
            cx += d.textlength(t, font=f)
        cy += lh
    return cy


def normalize_yellow(base, sat=1.16, bright=1.03):
    """생성 이미지들의 웜골드 배경을 더 선명한 브랜드 옐로우 톤으로 살짝 그레이딩."""
    from PIL import ImageEnhance
    rgb = base.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    rgb = ImageEnhance.Brightness(rgb).enhance(bright)
    return rgb.convert("RGBA")


def cta_pill(d, text, x, y, size=40, fg=WHITE, bg=CHARCOAL, arrow=True, pad_x=48, pad_y=26):
    f = xbold(size)
    tw = d.textlength(text, font=f)
    aw = size * 0.95 if arrow else 0
    w = pad_x + tw + (size * 0.4 + aw if arrow else 0) + pad_x
    h = pad_y * 2 + size
    d.rounded_rectangle([x, y, x + w, y + h], radius=int(h / 2), fill=bg)
    tx = x + pad_x
    d.text((tx, y + pad_y - size * 0.06), text, font=f, fill=fg)
    if arrow:
        ax = tx + tw + size * 0.42
        ay = y + h / 2
        r = size * 0.34
        d.line([(ax, ay), (ax + r, ay)], fill=fg, width=max(3, int(size * 0.09)))
        d.line([(ax + r * 0.55, ay - r * 0.5), (ax + r, ay), (ax + r * 0.55, ay + r * 0.5)],
               fill=fg, width=max(3, int(size * 0.09)), joint="curve")
    return (w, h)


def slogan_chip(d, x, y, text="커피를 커피답게", size=34, dot=YELLOW, fg=CHARCOAL):
    """점 + 슬로건 (브랜드 태그라인 락업). 옐로우 카드는 dot=CHARCOAL."""
    f = xbold(size)
    r = int(size * 0.22)
    cyc = y + size * 0.52
    d.ellipse([x, cyc - r, x + r * 2, cyc + r], fill=dot)
    d.text((x + r * 2 + size * 0.4, y), text, font=f, fill=fg)


def page_dots(d, active, total=3, y=None, x_right=None, size=13, gap=13,
              active_col=YELLOW, idle_col=(43, 43, 43)):
    """캐러셀 페이지 인디케이터. 옐로우 카드는 active_col=차콜."""
    y = y if y is not None else 84
    x_right = x_right if x_right is not None else (W - MARGIN)
    width = total * size + (total - 1) * gap
    x = x_right - width
    for i in range(total):
        col = active_col if i == active else idle_col
        cx0 = x + i * (size + gap)
        d.ellipse([cx0, y, cx0 + size, y + size], fill=col)
