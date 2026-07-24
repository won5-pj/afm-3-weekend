# -*- coding: utf-8 -*-
"""컴포즈커피 인스타 광고카드 5종 합성 (1080x1080)
  single        : 단일 브랜드 광고 (슬로건 헤드라인 + 제품 + CTA)
  carousel 1/2/3: 후킹 → 본문 → CTA
"""
import pathlib
from PIL import ImageDraw
import brandkit as bk

OUT = bk.HERE / "out"
OUT.mkdir(exist_ok=True)
MAXW = bk.W - 2 * bk.MARGIN


def save(base, name):
    base.convert("RGB").save(OUT / name, quality=95)
    print("저장:", name)


# ---------------- 단일 광고 ----------------
def build_single():
    base = bk.load_bg("hero")
    base = bk.soft_top_scrim(base, to_y=0.52, alpha=64)
    d = ImageDraw.Draw(base)

    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.eyebrow(d, "EVERY DAY, COMPOSE", bk.MARGIN, 182, size=27)

    lines = [[("커피를", False)], [("커피답게", True)]]
    size = bk.fit_headline(lines, MAXW, start=140)
    bk.draw_headline(d, lines, bk.MARGIN, 232, size)

    bk.cta_pill(d, "가까운 매장 찾기", bk.MARGIN, 902, size=38, bg=bk.CHARCOAL)
    save(base, "single_ad.png")


# ---------------- 캐러셀 1 : 후킹 ----------------
def build_c1():
    base = bk.load_bg("c1_hook")
    base = bk.soft_top_scrim(base, to_y=0.5, alpha=60)
    d = ImageDraw.Draw(base)

    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=0, total=3, y=74)

    bk.eyebrow(d, "매일의 커피 습관", bk.MARGIN, 190, size=27, fill=bk.CHARCOAL)
    lines = [[("매일 마시는", False)], [("커피", True), ("니까.", False)]]
    size = bk.fit_headline(lines, MAXW, start=136)
    bk.draw_headline(d, lines, bk.MARGIN, 238, size)

    # 스와이프 힌트
    f = bk.xbold(28)
    d.text((bk.MARGIN, 936), "밀어서 보기", font=f, fill=bk.MUTED)
    tw = d.textlength("밀어서 보기", font=f)
    d.text((bk.MARGIN + tw + 14, 934), "→", font=bk.xbold(30), fill=bk.YELLOW)
    save(base, "carousel_1.png")


# ---------------- 캐러셀 2 : 본문 ----------------
def build_c2():
    base = bk.load_bg("c2_body")
    base = bk.soft_top_scrim(base, to_y=0.5, alpha=62)
    d = ImageDraw.Draw(base)

    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=1, total=3, y=74)

    bk.eyebrow(d, "왜 컴포즈일까", bk.MARGIN, 190, size=27, fill=bk.CHARCOAL)
    lines = [[("합리적인 가격,", False)], [("타협 없는 ", False), ("맛", True), (".", False)]]
    size = bk.fit_headline(lines, MAXW, start=126)
    y_end = bk.draw_headline(d, lines, bk.MARGIN, 238, size)

    f = bk.xbold(33)
    d.text((bk.MARGIN, y_end + 14), "제대로 볶은 원두 · 매일 신선하게 내린 한 잔",
           font=f, fill=bk.MUTED)
    save(base, "carousel_2.png")


# ---------------- 캐러셀 3 : CTA ----------------
def build_c3():
    base = bk.load_bg("c3_cta")
    base = bk.soft_top_scrim(base, to_y=0.5, alpha=64)
    d = ImageDraw.Draw(base)

    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=2, total=3, y=74)

    bk.eyebrow(d, "지금 만나러 가기", bk.MARGIN, 190, size=27, fill=bk.CHARCOAL)
    lines = [[("오늘 커피는,", False)], [("컴포즈", True), ("에서.", False)]]
    size = bk.fit_headline(lines, MAXW, start=132)
    bk.draw_headline(d, lines, bk.MARGIN, 238, size)

    bk.cta_pill(d, "가까운 매장 찾기", bk.MARGIN, 560, size=38, bg=bk.CHARCOAL)
    bk.slogan_chip(d, bk.MARGIN, 936, text="커피를 커피답게", size=34)
    save(base, "carousel_3.png")


if __name__ == "__main__":
    build_single()
    build_c1()
    build_c2()
    build_c3()
    print("\n완료.")
