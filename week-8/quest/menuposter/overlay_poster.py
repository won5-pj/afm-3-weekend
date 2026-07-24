# -*- coding: utf-8 -*-
"""Gemini 실사 히어로컷 위에 '두바이 피스타치오 소금빵' 신메뉴 포스터 텍스트를 PIL로 정밀 합성.
   결과: 1080x1350 (인스타 4:5) PNG + 인쇄용 PDF.  2배 캔버스 렌더 후 다운스케일로 선명하게."""
import sys, math, pathlib, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = pathlib.Path(__file__).parent
BHS  = str(HERE / "fonts" / "BlackHanSans-Regular.ttf")
MG   = "C:/Windows/Fonts/malgun.ttf"
MGB  = "C:/Windows/Fonts/malgunbd.ttf"

TAG = sys.argv[1] if len(sys.argv) > 1 else "v1"
SRC = HERE / f"hero_{TAG}_raw.png"

S = 2                       # 렌더 배율
W, H = 1080 * S, 1350 * S   # 2160 x 2700

# ---------- palette ----------
CREAM   = (246, 239, 226)
CREAM_D = (236, 226, 208)
INK     = (43, 33, 26)
PIST    = (96, 142, 44)      # 피스타치오 그린 (강조색)
PIST_D  = (72, 108, 32)
CORAL   = (223, 77, 48)      # 긴급/한정 강조
MUTED   = (122, 106, 90)
GOLD    = (196, 150, 60)
WHITE   = (252, 249, 243)

PAD = 96 * S
CX  = W // 2
MAXW = W - 2 * PAD

# ---------- fonts ----------
def F(path, size): return ImageFont.truetype(path, size)
f_brand   = F(MGB, 34 * S)
f_brand_e = F(MG,  20 * S)
f_kick    = F(MGB, 30 * S)
f_name    = F(MGB, 44 * S)
f_desc    = F(MG,  25 * S)
f_price   = F(BHS, 70 * S)
f_won     = F(BHS, 40 * S)
f_period  = F(MGB, 27 * S)
f_urg     = F(MGB, 30 * S)


# ---------- helpers ----------
def cover_resize(img, w, h):
    sw, sh = img.size
    s = max(w / sw, h / sh)
    nw, nh = round(sw * s), round(sh * s)
    img = img.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return img.crop((l, t, l + w, t + h))


def wlen(d, t, f): return d.textlength(t, font=f)


def draw_center(d, text, y, font, fill, track=0, shadow=None):
    ws = [d.textlength(c, font=font) for c in text]
    total = sum(ws) + track * (len(text) - 1 if text else 0)
    x = CX - total / 2
    if shadow:
        sx, sy, sc = shadow
        cx = x
        for c, w in zip(text, ws):
            d.text((cx + sx, y + sy), c, font=font, fill=sc); cx += w + track
    cx = x
    for c, w in zip(text, ws):
        d.text((cx, y), c, font=font, fill=fill); cx += w + track
    return total


def draw_segments_center(d, segs, y, track=0):
    """segs = [(text, font, color)] 를 한 줄로 가운데 정렬 그리기."""
    total = 0
    parts = []
    for t, f, c in segs:
        ws = [d.textlength(ch, font=f) for ch in t]
        w = sum(ws) + track * (len(t) - 1 if t else 0)
        parts.append((t, f, c, ws, w))
        total += w
    x = CX - total / 2
    for t, f, c, ws, w in parts:
        cx = x
        for ch, cw in zip(t, ws):
            d.text((cx, y), ch, font=f, fill=c); cx += cw + track
        x += w
    return total


def fit_font(path, text, target_w, start, floor=40):
    s = start
    while s > floor:
        f = ImageFont.truetype(path, s)
        d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
        if d.textlength(text, font=f) <= target_w:
            return f
        s -= 4
    return ImageFont.truetype(path, floor)


def top_gradient(base, top_h, max_a=150):
    """상단 밝은 사진 위 브랜드명 가독성을 위한 어두운 그라데이션."""
    g = Image.new("L", (1, top_h), 0)
    for yy in range(top_h):
        g.putpixel((0, yy), int(max_a * (1 - yy / top_h)))
    g = g.resize((W, top_h))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(Image.new("RGBA", (W, top_h), (8, 6, 4, 255)), (0, 0),
                Image.merge("RGBA", [g.point(lambda p: 0)] * 3 + [g]))
    return Image.alpha_composite(base, layer)


def star(d, cx, cy, R, fill):
    r = R * 0.42; pts = []
    for i in range(10):
        rad = R if i % 2 == 0 else r
        a = math.radians(-90 + i * 36)
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    d.polygon(pts, fill=fill)


def diamond(d, cx, cy, r, fill):
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=fill)


def main():
    base = cover_resize(Image.open(SRC).convert("RGB"), W, H).convert("RGBA")

    # 상단 브랜드 가독성 그라데이션
    base = top_gradient(base, 260 * S, max_a=140)

    # ----- 하단 크림 패널 (사진 50% 이상 유지: 패널 top = 675/1350) -----
    PT = 675 * S                      # 패널 top → 사진 정확히 50%
    RAD = 60 * S
    # 패널 위로 뜨는 부드러운 그림자
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([-RAD, PT - 26 * S, W + RAD, H + RAD], radius=RAD, fill=(0, 0, 0, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(26 * S))
    base = Image.alpha_composite(base, sh)
    # 패널 본체
    panel = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle([-RAD, PT, W + RAD, H + RAD], radius=RAD, fill=CREAM + (255,))
    base = Image.alpha_composite(base, panel)

    d = ImageDraw.Draw(base)

    # 패널 상단 얇은 경계 악센트
    ACC_Y = PT + 26 * S
    d.rounded_rectangle([PAD, ACC_Y, W - PAD, ACC_Y + 5 * S], radius=3 * S, fill=CREAM_D)

    # ----- 브랜드 (사진 위 상단) -----
    draw_center(d, "소금꽃 베이커리", 58 * S, f_brand, WHITE,
                shadow=(0, 2 * S, (0, 0, 0, 160)))
    draw_center(d, "S A L T B L O O M   B A K E R Y", 108 * S, f_brand_e,
                (232, 224, 210), track=1)

    # ===== 패널 콘텐츠: 블록 높이 측정 → 히어로 자동맞춤 → 세로 중앙배치 =====
    kick = "시즌 한정 신메뉴"
    hero1, hero2a, hero2b = "겉은 바삭,", "속은 ", "두바이"
    name = "두바이 피스타치오 소금빵"
    desc = "짭조름 바삭한 소금빵 속을 채운 진한 피스타치오 크림과 카다이프"
    period = "7.25 – 8.9 한정 판매  ·  하루 30개 한정 수량"
    urg = "SNS에서 난리 난 그 두바이 조합, 오픈런 각!"

    # desc 줄바꿈
    dlines, cur = [], ""
    for word in desc.split(" "):
        test = (cur + " " + word).strip()
        if d.textlength(test, font=f_desc) <= MAXW - 20 * S:
            cur = test
        else:
            dlines.append(cur); cur = word
    if cur: dlines.append(cur)

    # 히어로 폰트 폭 맞춤 (두 줄 모두 폭 안에)
    hw = min(fit_font(BHS, hero1, MAXW, 116 * S).size,
             fit_font(BHS, hero2a + hero2b, MAXW, 116 * S).size)

    G = {"kick": 24 * S, "hero": 20 * S, "name": 30 * S,
         "desc": 22 * S, "div": 24 * S, "price": 10 * S, "period": 22 * S}

    def block_heights(fs):
        lh = int(fs * 0.90)
        return {
            "kick":  int(f_kick.size * 1.05),
            "hero":  lh + int(fs * 0.86),
            "name":  int(f_name.size * 0.86) + 16 * S,
            "desc":  38 * S * len(dlines),
            "div":   8 * S,
            "price": int(f_price.size * 0.80),
            "period": int(f_period.size * 1.15),
            "banner": 56 * S,
        }, lh

    region_top = ACC_Y + 34 * S
    region_bot = H - 44 * S
    avail = region_bot - region_top

    fs = hw
    while fs > 60 * S:
        bh, lh = block_heights(fs)
        order = ["kick", "hero", "name", "desc", "div", "price", "period", "banner"]
        total = sum(bh[k] for k in order) + sum(G.values())
        if total <= avail:
            break
        fs -= 4
    bh, lh = block_heights(fs)
    f_hero = ImageFont.truetype(BHS, fs)

    y = region_top + max(0, (avail - total) / 2)

    # 1) 킥커 (코랄 + 다이아)
    kw = sum(d.textlength(c, font=f_kick) for c in kick) + 6 * S * (len(kick) - 1)
    draw_center(d, kick, y, f_kick, CORAL, track=6 * S)
    diamond(d, CX - kw / 2 - 32 * S, y + f_kick.size * 0.5, 7 * S, CORAL)
    diamond(d, CX + kw / 2 + 32 * S, y + f_kick.size * 0.5, 7 * S, CORAL)
    y += bh["kick"] + G["kick"]

    # 2) 히어로 (빅 타이포 2줄, '두바이' 강조색)
    draw_center(d, hero1, y, f_hero, INK, shadow=(0, 3 * S, (0, 0, 0, 38)))
    draw_segments_center(d, [(hero2a, f_hero, INK), (hero2b, f_hero, PIST)], y + lh)
    y += bh["hero"] + G["hero"]

    # 3) 제품명 + 그린 언더라인
    draw_center(d, name, y, f_name, INK, track=1 * S)
    nw = sum(d.textlength(c, font=f_name) for c in name) + 1 * S * (len(name) - 1)
    uy = y + int(f_name.size * 0.86)
    d.rounded_rectangle([CX - nw / 2, uy, CX + nw / 2, uy + 5 * S], radius=3 * S, fill=PIST)
    y += bh["name"] + G["name"]

    # 4) 한 줄 설명
    for ln in dlines:
        draw_center(d, ln, y, f_desc, MUTED)
        y += 38 * S
    y += G["desc"]

    # 5) 구분선 (양옆 라인 + 그린 다이아)
    dyv = y + bh["div"] / 2
    d.line([PAD + 70 * S, dyv, CX - 28 * S, dyv], fill=CREAM_D, width=2 * S)
    d.line([CX + 28 * S, dyv, W - PAD - 70 * S, dyv], fill=CREAM_D, width=2 * S)
    diamond(d, CX, dyv, 9 * S, PIST)
    y += bh["div"] + G["div"]

    # 6) 가격 (빅, 그린 강조)
    won, price = "₩", "4,800"
    ww = d.textlength(won, font=f_won)
    pw = d.textlength(price, font=f_price)
    gap = 8 * S
    px = CX - (ww + gap + pw) / 2
    d.text((px, y + f_price.size * 0.26), won, font=f_won, fill=PIST_D)
    d.text((px + ww + gap, y), price, font=f_price, fill=PIST)
    y += bh["price"] + G["price"]

    # 7) 보조 정보 1줄 — 가격·행사기간
    draw_center(d, period, y, f_period, INK, track=1 * S)
    y += bh["period"] + G["period"]

    # 8) 구매 이유 배너 (코랄 하이라이트)
    uw = sum(d.textlength(c, font=f_urg) for c in urg) + 1 * S * (len(urg) - 1)
    bx0, bx1 = CX - uw / 2 - 34 * S, CX + uw / 2 + 34 * S
    by0, by1 = y, y + bh["banner"]
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=(by1 - by0) / 2, fill=CORAL)
    draw_center(d, urg, y + (bh["banner"] - f_urg.size) / 2 - 2 * S, f_urg, WHITE, track=1 * S)

    # ----- 출력 -----
    final = base.convert("RGB")
    small = final.resize((1080, 1350), Image.LANCZOS)
    out_png = HERE / f"두바이소금빵_포스터_{TAG}.png"
    out_pdf = HERE / f"두바이소금빵_포스터_{TAG}.pdf"
    out_hi  = HERE / f"두바이소금빵_포스터_{TAG}@2x.png"
    small.save(out_png)
    final.save(out_hi)
    small.save(out_pdf, "PDF", resolution=200.0)
    print("저장:", out_png.name, "/", out_pdf.name, "/", out_hi.name, "| 최종", small.size)


if __name__ == "__main__":
    main()
