# -*- coding: utf-8 -*-
"""컴포즈커피 인스타 광고용 텍스트 프리 비주얼 생성 (Gemini 2.5 Flash Image, 1:1)

브랜드 컬러블록/카피/CTA/로고는 이후 PIL 오버레이 단계에서 정밀 합성한다.
여기서는 '여백이 넉넉하고 톤이 일관된 프리미엄 커피 제품 사진'만 생성한다.
"""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent.parent          # instagram/
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
RAW = HERE / "raw"
RAW.mkdir(exist_ok=True)
MODEL = "gemini-2.5-flash-image"

client = genai.Client(api_key=KEY)

# 4장 전체를 하나의 캠페인처럼 묶는 공통 아트디렉션 (톤앤매너 일관성)
COMMON = (
    "High-end Korean cafe advertising product photography for a coffee brand. "
    "CONSISTENT ART DIRECTION across the whole set: a warm CREAM / oat-beige seamless "
    "paper studio backdrop (roughly #FBF7EC), soft directional morning light from the "
    "upper left, gentle long soft shadows, clean matte editorial look, shallow depth of "
    "field, calm premium minimal mood, slightly warm color grade. "
    "The drinks are served in clean transparent plastic cups with a domed/flat lid "
    "(Korean takeout cafe style), no branding on the cup. "
    "CRITICAL — 100% TEXT-FREE: absolutely NO text, letters, numbers, logos, watermarks, "
    "labels, stickers or captions anywhere in the image. Leave generous empty negative "
    "space as described so I can place typography myself later. "
    "Sharp, high resolution, professional, photorealistic. Square 1:1 composition."
)

VERSIONS = {
    # ---- 단일 광고 히어로 ----
    "hero": (
        COMMON + "\n\nSCENE (single hero): ONE tall iced Americano in a clear cup with "
        "big clean ice cubes and fresh condensation water droplets, placed in the LOWER "
        "-CENTER of the frame. A couple of scattered whole coffee beans on the surface "
        "near the base. Keep the ENTIRE UPPER HALF of the frame as clean empty cream "
        "negative space. Very minimal, expensive, appetizing."
    ),
    # ---- 캐러셀 1: 후킹 ----
    "c1_hook": (
        COMMON + "\n\nSCENE (hook): a strong appetizing close-up of ONE iced Americano "
        "cup, slightly high angle, water droplets catching the light, a few coffee beans "
        "beside it, positioned toward the BOTTOM of the frame. Keep the TOP 45% as clean "
        "empty cream negative space. Fresh, crisp, mouth-watering."
    ),
    # ---- 캐러셀 2: 본문(라인업/품질) ----
    "c2_body": (
        COMMON + "\n\nSCENE (line-up): THREE cups in a neat row across the lower third of "
        "the frame — an iced Americano, an iced cafe latte with visible milk gradient, and "
        "a hot latte with subtle latte art in a small cup — plus a light scatter of roasted "
        "coffee beans in front. Keep the TOP HALF as clean empty cream negative space. "
        "Balanced, premium, showing variety and quality."
    ),
    # ---- 캐러셀 3: CTA(초대) ----
    "c3_cta": (
        COMMON + "\n\nSCENE (invitation): ONE iced Americano cup resting on a warm light "
        "wood cafe table in the LOWER-LEFT area, with a soft, cozy, warmly-lit blurred cafe "
        "interior bokeh in the background (still bright and clean, cream tones). Keep the "
        "RIGHT SIDE and TOP as calm negative space. Inviting, welcoming, warm."
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
