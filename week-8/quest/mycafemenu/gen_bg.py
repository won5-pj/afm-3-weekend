# -*- coding: utf-8 -*-
"""'으스스' 유령·할로윈 카페 메뉴판 배경을 Gemini 2.5 Flash Image로 생성.
   - 텍스트는 나중에 PIL로 정밀 합성하므로, 여기서는 100% TEXT-FREE 비주얼만 생성.
   - 검정 + 주황 컬러, 세련된 고급 할로윈 무드, 세로형(3:4)."""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
MODEL = "gemini-2.5-flash-image"
client = genai.Client(api_key=KEY)

COMMON = (
    "Create a HIGH-END, sophisticated VERTICAL cafe MENU POSTER BACKGROUND (portrait) "
    "for a trendy Halloween / ghost themed specialty coffee cafe aimed at stylish young adults. "
    "Brand mood: 'spooky-chic' — elegant, modern, minimal, upscale — NOT childish, NOT cheap, NOT cartoonish clip-art. "
    "STRICT COLOR PALETTE: deep matte BLACK background with warm PUMPKIN-ORANGE (#FF8A20) accents and a little soft cream glow. "
    "Only black, orange and small warm-white highlights. No other strong colors. "
    "Decorative motifs, tastefully and sparsely placed around the EDGES and CORNERS only: "
    "delicate fine spiderwebs in the top corners, a couple of small elegant translucent ghosts, "
    "a few tiny flying bats, a glowing full moon, subtle jack-o'-lanterns near the bottom, "
    "an ornamental thin orange line border/frame, faint drifting fog, small sparkles. "
    "COMPOSITION — VERY IMPORTANT: keep the whole CENTER as a calm, clean, mostly-empty darker vertical panel "
    "with lots of negative space, because I will add menu text there myself. Decorations must frame the edges, "
    "never cover the middle. "
    "CRITICAL — 100% TEXT-FREE: absolutely NO letters, NO numbers, NO words, NO captions, NO logos, NO watermarks "
    "anywhere in the image. Do not write anything. "
    "Finish: subtle fine paper grain, soft vignette, gentle warm orange glow, crisp and print-quality, "
    "professional editorial poster look."
)

VERSIONS = {
    "v1": (
        COMMON + "\n\nSTYLE A — ELEGANT FRAMED:\n"
        "A refined ornamental orange thin-line frame runs just inside the edges like a classy menu card. "
        "One glowing full moon softly placed in the upper area, a single graceful ghost drifting near a top corner, "
        "fine spiderwebs in both top corners, a neat little row of small glowing jack-o'-lanterns along the very bottom. "
        "Very balanced, symmetric, premium stationery feel. Center kept clean and dark for text."
    ),
    "v2": (
        COMMON + "\n\nSTYLE B — MOODY ATMOSPHERIC:\n"
        "More cinematic and atmospheric: a big soft glowing orange moon high up with a couple of tiny bats crossing it, "
        "low drifting fog and a faint spooky forest / graveyard silhouette hint only along the very bottom edge, "
        "two small translucent ghosts floating in the side margins, delicate spiderweb in one top corner. "
        "Rich blacks, dramatic soft orange rim-light glow. Center kept calm and uncluttered for text."
    ),
}


def generate(tag, prompt):
    print(f"\n=== 생성: {tag} ===", flush=True)
    cfg = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="3:4"),
    )
    resp = client.models.generate_content(model=MODEL, contents=[prompt], config=cfg)
    saved = None
    for cand in resp.candidates or []:
        for part in (cand.content.parts or []):
            if getattr(part, "inline_data", None) and part.inline_data.data:
                img = Image.open(io.BytesIO(part.inline_data.data))
                out = HERE / f"bg_{tag}_raw.png"
                img.save(out)
                saved = out
                print(f"저장: {out.name}  크기={img.size}", flush=True)
            elif getattr(part, "text", None):
                print("모델 텍스트:", part.text[:200], flush=True)
    if not saved:
        print("!! 이미지 파트 없음. 응답 확인 필요.", flush=True)
    return saved


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    targets = list(VERSIONS.keys()) if which == "all" else [which]
    for t in targets:
        try:
            generate(t, VERSIONS[t])
        except Exception as e:
            print(f"!! {t} 실패: {type(e).__name__}: {e}", flush=True)
