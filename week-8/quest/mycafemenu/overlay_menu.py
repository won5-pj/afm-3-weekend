# -*- coding: utf-8 -*-
"""Gemini 배경 위에 '으스스' 카페 메뉴 텍스트를 PIL로 정밀 합성 → 최종 메뉴판(PNG+PDF)."""
import sys, math, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = pathlib.Path(__file__).parent
BHS = str(HERE / "fonts" / "BlackHanSans-Regular.ttf")
MG = "C:/Windows/Fonts/malgun.ttf"
MGB = "C:/Windows/Fonts/malgunbd.ttf"

BG_TAG = sys.argv[1] if len(sys.argv) > 1 else "v1"
SRC = HERE / f"bg_{BG_TAG}_raw.png"

SCALE = 2
W, H = 864 * SCALE, 1184 * SCALE          # 1728 x 2368

# ---- palette (검정 배경 + 주황) ----
ORANGE   = (255, 150, 54)
ORANGE_HI= (255, 186, 96)
ORANGE_DK= (156, 86, 28)
CREAM    = (246, 239, 228)
MUTED    = (190, 172, 156)
INK      = (10, 8, 10)

MX_L, MX_R = 210, W - 210                  # 텍스트 좌/우 안전선
CX = W // 2

# ---------- fonts ----------
f_title = ImageFont.truetype(BHS, 168)
f_sub   = ImageFont.truetype(MG,  32)
f_tag   = ImageFont.truetype(MG,  31)
f_sec   = ImageFont.truetype(BHS, 50)
f_secen = ImageFont.truetype(MG,  24)
f_name  = ImageFont.truetype(MGB, 42)
f_desc  = ImageFont.truetype(MG,  25)
f_price = ImageFont.truetype(MGB, 44)
f_sig   = ImageFont.truetype(MGB, 19)
f_foot  = ImageFont.truetype(MG,  26)
f_footb = ImageFont.truetype(MGB, 28)


# ---------- helpers ----------
def cover_resize(img, w, h):
    sw, sh = img.size
    s = max(w / sw, h / sh)
    nw, nh = round(sw * s), round(sh * s)
    img = img.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return img.crop((l, t, l + w, t + h))


def tracked(draw, text, x, y, font, fill, track=0, center_x=None):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + track * (len(text) - 1 if text else 0)
    if center_x is not None:
        x = center_x - total / 2
    cx = x
    for ch, wch in zip(text, widths):
        draw.text((cx, y), ch, font=font, fill=fill)
        cx += wch + track
    return x, total


def dotted_leader(draw, x1, x2, y, fill=ORANGE_DK, gap=22, r=3.0):
    x = x1
    while x <= x2:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)
        x += gap


def star(draw, cx, cy, R, fill):
    r = R * 0.42
    pts = []
    for i in range(10):
        rad = R if i % 2 == 0 else r
        a = math.radians(-90 + i * 36)
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    draw.polygon(pts, fill=fill)


def soft_glow_text(base, text, x, y, font, color, blur=18, grow=0):
    """텍스트 뒤에 은은한 주황 글로우."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((x, y), text, font=font, fill=color + (180,), stroke_width=grow, stroke_fill=color + (180,))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(base, layer)


# ---------- thin-line section icons (주황, 프레임과 통일) ----------
def icon_cup(d, x, y, s):
    lw = 4
    d.rounded_rectangle([x, y + s*0.28, x + s*0.72, y + s], radius=int(s*0.12),
                        outline=ORANGE, width=lw)
    d.arc([x + s*0.62, y + s*0.36, x + s*0.98, y + s*0.74], -80, 90, fill=ORANGE, width=lw)
    for i, sx in enumerate((0.22, 0.44)):
        d.arc([x + s*sx - s*0.09, y - s*0.02, x + s*sx + s*0.09, y + s*0.22],
              -20, 200, fill=ORANGE_HI, width=3)


def icon_potion(d, x, y, s):
    lw = 4
    cx = x + s*0.5
    # 목
    d.line([cx - s*0.12, y, cx - s*0.12, y + s*0.28], fill=ORANGE, width=lw)
    d.line([cx + s*0.12, y, cx + s*0.12, y + s*0.28], fill=ORANGE, width=lw)
    d.line([cx - s*0.18, y, cx + s*0.18, y], fill=ORANGE, width=lw)      # 코르크
    # 둥근 몸통
    d.ellipse([cx - s*0.34, y + s*0.30, cx + s*0.34, y + s*0.98], outline=ORANGE, width=lw)
    # 약물 라인 + 기포
    d.arc([cx - s*0.30, y + s*0.40, cx + s*0.30, y + s*1.02], 20, 160, fill=ORANGE_HI, width=3)
    d.ellipse([cx - s*0.06, y + s*0.62, cx + s*0.02, y + s*0.70], outline=ORANGE_HI, width=2)
    d.ellipse([cx + s*0.10, y + s*0.72, cx + s*0.17, y + s*0.79], outline=ORANGE_HI, width=2)


def icon_pumpkin(d, x, y, s):
    lw = 4
    cx, cy = x + s*0.5, y + s*0.62
    d.line([cx, y + s*0.12, cx, y + s*0.30], fill=(120, 160, 70), width=5)   # 꼭지
    d.ellipse([cx - s*0.44, cy - s*0.34, cx + s*0.44, cy + s*0.34], outline=ORANGE, width=lw)
    d.arc([cx - s*0.20, cy - s*0.34, cx + s*0.20, cy + s*0.34], 250, 470, fill=ORANGE, width=3)
    d.arc([cx - s*0.02, cy - s*0.34, cx + s*0.30, cy + s*0.34], 250, 470, fill=ORANGE, width=3)
    d.arc([cx - s*0.30, cy - s*0.34, cx + s*0.02, cy + s*0.34], 70, 290, fill=ORANGE, width=3)


ICONS = {"cup": icon_cup, "potion": icon_potion, "pumpkin": icon_pumpkin}

# ---------- menu data ----------
MENU = [
    ("커피", "COFFEE", "cup", [
        ("유령라떼", "흑임자 라떼 위에 살포시 뜬 유령 라떼아트", 5500, True),
        ("흡혈귀 아메리카노", "블러드오렌지를 더한 진하고 붉은 콜드 샷", 4500, False),
        ("호박 대소동 라떼", "가을향 가득 호박 스파이스 라떼", 5800, False),
    ]),
    ("논커피", "NON-COFFEE", "potion", [
        ("마녀의 초록 물약", "청포도·민트로 끓인 스모크 에이드", 6000, True),
        ("유령의 눈물 소다", "새콤달콤 반짝이는 블루레몬 소다", 5500, False),
        ("검은 고양이 밀크티", "쫀득 흑당 밀크티 위 고양이 귀 토핑", 5500, False),
    ]),
    ("디저트", "DESSERT", "pumpkin", [
        ("붕대 감은 미라 크로플", "생크림 붕대를 칭칭 감은 바삭 크로플", 5500, False),
        ("무덤가 초코 브라우니", "오레오 흙과 해골 토퍼를 얹은 브라우니", 5000, False),
    ]),
]


def main():
    base = cover_resize(Image.open(SRC).convert("RGB"), W, H).convert("RGBA")

    # 중앙 텍스트 영역용 은은한 스크림(가독성 확보, 프레임/달/호박은 그대로 노출)
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    sd.rounded_rectangle([150, 760, W - 150, 2120], radius=48, fill=(6, 5, 8, 96))
    scrim = scrim.filter(ImageFilter.GaussianBlur(34))
    base = Image.alpha_composite(base, scrim)

    # ----- 타이틀 (글로우 + 본문) -----
    tw = base_draw_len(base, "으스스", f_title)
    tx = CX - tw / 2
    base = soft_glow_text(base, "으스스", tx, 452, f_title, ORANGE, blur=26)
    d = ImageDraw.Draw(base)
    # 그림자
    d.text((tx, 452 + 5), "으스스", font=f_title, fill=(0, 0, 0, 160))
    d.text((tx, 452), "으스스", font=f_title, fill=ORANGE,
           stroke_width=2, stroke_fill=ORANGE_HI)

    tracked(d, "GHOST  &  HALLOWEEN  CAFE", 0, 648, f_sub, CREAM, track=6, center_x=CX)
    tracked(d, "밤마다 문을 여는 유령 카페 · 오싹하게 달콤하게", 0, 700, f_tag, MUTED, track=1, center_x=CX)

    # 타이틀 아래 장식 라인 (양옆 짧은 주황선 + 가운데 별)
    d.line([CX - 250, 750, CX - 40, 750], fill=ORANGE_DK, width=2)
    d.line([CX + 40, 750, CX + 250, 750], fill=ORANGE_DK, width=2)
    star(d, CX, 750, 12, ORANGE)

    # ----- 섹션 & 아이템 -----
    y = 800
    for kr, en, icon_key, items in MENU:
        ICONS[icon_key](d, MX_L, y - 6, 60)
        d.text((MX_L + 86, y), kr, font=f_sec, fill=ORANGE)
        kw = d.textlength(kr, font=f_sec)
        d.text((MX_L + 86 + kw + 18, y + 22), "· " + en, font=f_secen, fill=MUTED)
        d.line([MX_L, y + 68, MX_R, y + 68], fill=ORANGE_DK, width=2)
        y += 92

        for name, desc, price, sig in items:
            ny = y + 6
            # 시그니처 별
            if sig:
                star(d, MX_L + 14, ny + 22, 15, ORANGE)
            name_x = MX_L + (44 if sig else 0)
            d.text((name_x, ny), name, font=f_name, fill=CREAM)
            name_end = name_x + d.textlength(name, font=f_name)

            # 시그니처 배지
            if sig:
                tagtxt = "SIGNATURE"
                twd = d.textlength(tagtxt, font=f_sig)
                px0 = name_end + 20
                d.rounded_rectangle([px0, ny + 6, px0 + twd + 28, ny + 40],
                                    radius=17, outline=ORANGE, width=2)
                d.text((px0 + 14, ny + 11), tagtxt, font=f_sig, fill=ORANGE)
                name_end = px0 + twd + 28

            # 가격 (오른쪽 정렬)
            pstr = f"{price:,}"
            pw = d.textlength(pstr, font=f_price)
            price_x = MX_R - pw
            d.text((price_x, ny - 1), pstr, font=f_price, fill=ORANGE)

            dotted_leader(d, name_end + 22, price_x - 22, ny + 30)
            d.text((name_x, ny + 56), desc, font=f_desc, fill=MUTED)
            y += 108
        y += 20

    # ----- 푸터 (하단 잭오랜턴 줄 위, 어두운 영역에 배치) -----
    fy = 2012
    d.line([MX_L + 120, fy, MX_R - 120, fy], fill=ORANGE_DK, width=2)
    star(d, CX, fy, 10, ORANGE)
    tracked(d, "OPEN  11:00 – 23:00   ·   연중무휴", 0, fy + 24, f_footb, CREAM, track=2, center_x=CX)
    tracked(d, "귀신도 홀린 그 맛 — 모든 가격 단위: 원(₩)", 0, fy + 64, f_foot, (206, 190, 174), track=1, center_x=CX)

    out_png = HERE / f"으스스_메뉴판_{BG_TAG}.png"
    out_pdf = HERE / f"으스스_메뉴판_{BG_TAG}.pdf"
    final = base.convert("RGB")
    final.save(out_png)
    final.save(out_pdf, "PDF", resolution=200.0)
    print("저장:", out_png.name, "/", out_pdf.name, final.size)


def base_draw_len(base, text, font):
    return ImageDraw.Draw(base).textlength(text, font=font)


if __name__ == "__main__":
    main()
