# -*- coding: utf-8 -*-
"""컴포즈커피 '옐로우 시그니처' 광고용 비주얼 — 브랜드 옐로우 배경 + 다양한 구도
(Gemini 2.5 Flash Image, 1:1, 텍스트 프리). 카피/CTA/로고는 이후 PIL 오버레이."""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent.parent
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
RAW = HERE / "raw"
RAW.mkdir(exist_ok=True)
MODEL = "gemini-2.5-flash-image"
client = genai.Client(api_key=KEY)

COMMON = (
    "Bold, punchy Korean cafe advertising product photography for a coffee brand whose "
    "SIGNATURE color is a vivid golden yellow. "
    "BACKDROP: a saturated bright golden-yellow seamless studio backdrop, approximately "
    "#FFD902 (warm mustard-gold, NOT lemon, NOT orange), evenly lit, filling the frame — "
    "yellow must clearly DOMINATE the image. High-key crisp lighting, clean soft shadows, "
    "energetic, appetizing, premium but playful mood. "
    "Drinks are in clean transparent plastic takeout cups with a domed/flat lid, no branding. "
    "CRITICAL — 100% TEXT-FREE: absolutely NO text, letters, numbers, logos, watermarks, "
    "labels or captions anywhere. Leave the described area as clean empty yellow negative "
    "space for me to place typography later. "
    "Sharp, high resolution, photorealistic, professional. Square 1:1."
)

VERSIONS = {
    # 라이프스타일 — 손에 든 컵
    "y_hand": (
        COMMON + "\n\nSCENE: a real hand holding ONE iced Americano cup, forearm entering "
        "from the lower-right, raised slightly toward camera as if offering it, on the vivid "
        "yellow backdrop. Fresh condensation on the cup. Keep the UPPER-LEFT half as clean "
        "empty yellow negative space. Bright, lifestyle, inviting."
    ),
    # 다이내믹 — 얼음/스플래시
    "y_splash": (
        COMMON + "\n\nSCENE: ONE iced Americano in the LOWER-CENTER with big clear ice cubes "
        "and a few playful coffee droplets / a subtle splash frozen in motion around it, "
        "energetic. Keep the TOP HALF as clean empty yellow negative space. Dynamic, punchy."
    ),
    # 듀오 — 두 잔
    "y_duo": (
        COMMON + "\n\nSCENE: TWO cups side by side in the lower area — an iced Americano and "
        "an iced cafe latte with a visible milk gradient — as if a 1+1 pair, a few coffee "
        "beans in front. Keep the TOP 45% as clean empty yellow negative space. Cheerful, value."
    ),
    # 플랫레이 — 커피 + 디저트
    "y_flatlay": (
        COMMON + "\n\nSCENE: a neat top-down FLAT-LAY on a yellow surface — one iced Americano "
        "seen from above, a butter croissant on a small plate, and a scatter of roasted coffee "
        "beans, arranged in the LOWER portion. Keep the TOP HALF as clean empty yellow negative "
        "space. Editorial, cozy cafe brunch."
    ),
    # 매크로 — 클로즈업
    "y_macro": (
        COMMON + "\n\nSCENE: an extreme CLOSE-UP macro of an iced Americano — glistening ice "
        "cubes, rich dark coffee, fresh water droplets — cup cropped and filling the RIGHT side "
        "of the frame. Keep the LEFT third as clean empty yellow negative space. Mouth-watering."
    ),
    # 투고 — 테이크아웃
    "y_togo": (
        COMMON + "\n\nSCENE: a takeout iced Americano cup placed slightly LOWER-LEFT with a "
        "simple paper cup-holder / carrier feel, casual grab-and-go vibe, on the vivid yellow "
        "backdrop. Keep the RIGHT side and TOP as clean empty yellow negative space. Daily, brisk."
    ),
}


def generate(tag, prompt):
    print(f"\n=== 생성: {tag} ===", flush=True)
    cfg = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="1:1"),
    )
    resp = client.models.generate_content(model=MODEL, contents=[prompt], config=cfg)
    saved = None
    for cand in resp.candidates or []:
        for part in (cand.content.parts or []):
            if getattr(part, "inline_data", None) and part.inline_data.data:
                img = Image.open(io.BytesIO(part.inline_data.data))
                out = RAW / f"{tag}.png"
                img.save(out)
                saved = out
                print(f"저장: {out.name}  크기={img.size}", flush=True)
            elif getattr(part, "text", None):
                print("모델 텍스트:", part.text[:200], flush=True)
    if not saved:
        print(f"!! {tag}: 이미지 파트 없음", flush=True)
    return saved


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    targets = list(VERSIONS.keys()) if which == "all" else [which]
    ok = 0
    for t in targets:
        try:
            if generate(t, VERSIONS[t]):
                ok += 1
        except Exception as e:
            print(f"!! {t} 실패: {type(e).__name__}: {e}", flush=True)
    print(f"\n완료: {ok}/{len(targets)}", flush=True)
