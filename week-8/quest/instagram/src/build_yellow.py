# -*- coding: utf-8 -*-
"""컴포즈커피 '옐로우 시그니처' 광고카드 4종 합성 (1080x1080)
브랜드 옐로우 지배 + 차콜 타이포 + 인버스(차콜 마커/흰 글자) 하이라이트.
  y_single_ad   : 단일 (슬로건 히어로)
  y_carousel 1/2/3 : 후킹 → 본문 → CTA
"""
import pathlib
from PIL import ImageDraw
import brandkit as bk

OUT = bk.HERE / "out"
OUT.mkdir(exist_ok=True)
MAXW = bk.W - 2 * bk.MARGIN
IDLE = (43, 43, 43, 70)   # 비활성 도트(반투명 차콜)


def prep(tag):
    """옐로우 노멀라이즈 + 상단 브랜드옐로우 스크림으로 톤 통일."""
    base = bk.normalize_yellow(bk.load_bg(tag), sat=1.17, bright=1.03)
    base = bk.soft_top_scrim(base, to_y=0.52, alpha=115, color=bk.YELLOW)
    return base


def save(base, name):
    base.convert("RGB").save(OUT / name, quality=95)
    print("저장:", name)


# ---------------- 단일 : 슬로건 히어로 ----------------
def build_single():
    base = prep("y_splash")
    d = ImageDraw.Draw(base)
    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.eyebrow(d, "EVERY DAY, COMPOSE", bk.MARGIN, 182, size=27, fill=bk.CHARCOAL)

    lines = [[("커피를", False)], [("커피답게", True)]]
    size = bk.fit_headline(lines, MAXW, start=140)
    bk.draw_headline(d, lines, bk.MARGIN, 232, size,
                     hl=bk.CHARCOAL, hl_text=bk.WHITE)

    bk.cta_pill(d, "가까운 매장 찾기", bk.MARGIN, 904, size=38, bg=bk.CHARCOAL, fg=bk.WHITE)
    save(base, "y_single_ad.png")


# ---------------- 캐러셀 1 : 후킹 ----------------
def build_c1():
    base = prep("y_hand")
    d = ImageDraw.Draw(base)
    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=0, total=3, y=74, active_col=bk.CHARCOAL, idle_col=IDLE)

    bk.eyebrow(d, "매일의 커피 습관", bk.MARGIN, 188, size=27, fill=bk.CHARCOAL)
    # 컵(우측 상단)과 겹치지 않도록 좌측 컬럼으로 폭 제한
    lines = [[("매일 마시는", False)], [("커피", True), ("니까.", False)]]
    size = bk.fit_headline(lines, 610, start=118)
    bk.draw_headline(d, lines, bk.MARGIN, 226, size, hl=bk.CHARCOAL, hl_text=bk.WHITE)

    f = bk.xbold(28)
    d.text((bk.MARGIN, 936), "밀어서 보기", font=f, fill=bk.CHARCOAL)
    tw = d.textlength("밀어서 보기", font=f)
    d.text((bk.MARGIN + tw + 14, 933), "→", font=bk.xbold(31), fill=bk.CHARCOAL)
    save(base, "y_carousel_1.png")


# ---------------- 캐러셀 2 : 본문 ----------------
def build_c2():
    base = prep("y_duo")
    d = ImageDraw.Draw(base)
    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=1, total=3, y=74, active_col=bk.CHARCOAL, idle_col=IDLE)

    bk.eyebrow(d, "왜 컴포즈일까", bk.MARGIN, 190, size=27, fill=bk.CHARCOAL)
    lines = [[("합리적인 가격,", False)], [("타협 없는 ", False), ("맛", True), (".", False)]]
    size = bk.fit_headline(lines, MAXW, start=126)
    y_end = bk.draw_headline(d, lines, bk.MARGIN, 238, size, hl=bk.CHARCOAL, hl_text=bk.WHITE)

    d.text((bk.MARGIN, y_end + 14), "제대로 볶은 원두 · 매일 신선하게 내린 한 잔",
           font=bk.xbold(33), fill=bk.CHARCOAL)
    save(base, "y_carousel_2.png")


# ---------------- 캐러셀 3 : CTA ----------------
def build_c3():
    base = prep("y_togo")
    d = ImageDraw.Draw(base)
    bk.wordmark(d, x_left=bk.MARGIN, y=66, size=32)
    bk.page_dots(d, active=2, total=3, y=74, active_col=bk.CHARCOAL, idle_col=IDLE)

    bk.eyebrow(d, "지금 만나러 가기", bk.MARGIN, 188, size=27, fill=bk.CHARCOAL)
    lines = [[("오늘 커피는,", False)], [("컴포즈", True), ("에서.", False)]]
    size = bk.fit_headline(lines, MAXW, start=126)
    bk.draw_headline(d, lines, bk.MARGIN, 226, size, hl=bk.CHARCOAL, hl_text=bk.WHITE)

    # 컵(하단 중앙, y660~)과 겹치지 않도록 CTA·슬로건을 상단 좌측 컬럼에 스택
    bk.cta_pill(d, "가까운 매장 찾기", bk.MARGIN, 500, size=38, bg=bk.CHARCOAL, fg=bk.WHITE)
    bk.slogan_chip(d, bk.MARGIN, 604, text="커피를 커피답게", size=34, dot=bk.CHARCOAL)
    save(base, "y_carousel_3.png")


if __name__ == "__main__":
    build_single()
    build_c1()
    build_c2()
    build_c3()
    print("\n완료.")
