# -*- coding: utf-8 -*-
"""너덜트 스타일 유튜브 썸네일 2버전 생성 (Gemini 2.5 Flash Image)"""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
SRC = HERE / "source_maxres.jpg"
MODEL = "gemini-2.5-flash-image"

client = genai.Client(api_key=KEY)
src_bytes = SRC.read_bytes()
src_part = types.Part.from_bytes(data=src_bytes, mime_type="image/jpeg")

COMMON = (
    "You are creating a high-quality Korean YouTube thumbnail BACKGROUND image (16:9) for a "
    "'relatable everyday situation' sketch-comedy channel (너덜트 감성). "
    "Use the two REAL people in the provided reference photo and keep their real faces and "
    "likeness exactly: on the LEFT a man slurping black-bean noodles (짜장면) with chopsticks, "
    "on the RIGHT a woman winking while eating jokbal (족발) with her hands. "
    "Keep their exaggerated eating expressions. "
    "CRITICAL — TEXT-FREE: completely REMOVE the old '혼밥친구' caption from the reference, and do NOT "
    "render ANY text, letters, numbers, captions, watermarks or logos ANYWHERE in the image. The output "
    "must be 100% text-free; I will add the title text myself afterward. "
    "Sharp, high-resolution, professional, clean."
)

VERSIONS = {
    "v1": (
        COMMON + "\n\nCOMPOSITION VERSION A (clean / signature 너덜트 style):\n"
        "- Keep the man on the left and the woman on the right, roughly like the original, "
        "placed in the LOWER TWO-THIRDS of the frame.\n"
        "- Background: a clean, bright warm cream / off-white studio backdrop with a subtle soft vignette.\n"
        "- Leave the TOP THIRD of the frame as clean, empty cream negative space (for a title I will add).\n"
        "- Overall: minimal, clean, high-contrast, bright, funny. Absolutely no text."
    ),
    "v2": (
        COMMON + "\n\nCOMPOSITION VERSION B (high-energy split style, clearly DIFFERENT layout):\n"
        "- Re-arrange the composition: make the WINKING WOMAN eating jokbal the BIG main subject on the "
        "RIGHT foreground (larger, cut-in closer to camera), and place the man smaller on the LEFT side.\n"
        "- Background: a bold dynamic DIAGONAL color-block — a vivid electric blue (#1E63FF) wedge on one "
        "side and a bright warm panel on the other, with subtle speed/impact lines for variety-show energy.\n"
        "- Keep the LOWER-LEFT quarter of the frame as a relatively clean, simple solid area "
        "(for a title I will add). \n"
        "- Add a subtle yellow starburst/emphasis glow behind the woman for punch.\n"
        "- Overall: loud, punchy, high-energy, eye-catching. Absolutely no text."
    ),
}


def generate(tag, prompt):
    print(f"\n=== 생성: {tag} ===", flush=True)
    cfg = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="16:9"),
    )
    resp = client.models.generate_content(
        model=MODEL, contents=[prompt, src_part], config=cfg
    )
    saved = None
    for cand in resp.candidates or []:
        for part in (cand.content.parts or []):
            if getattr(part, "inline_data", None) and part.inline_data.data:
                img = Image.open(io.BytesIO(part.inline_data.data))
                out = HERE / f"{tag}_raw.png"
                img.save(out)
                saved = out
                print(f"저장: {out.name}  크기={img.size}", flush=True)
            elif getattr(part, "text", None):
                print("모델 텍스트:", part.text[:300], flush=True)
    if not saved:
        print("!! 이미지 파트 없음. 응답 확인 필요.", flush=True)
    return saved


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    targets = VERSIONS.keys() if which == "all" else [which]
    for t in targets:
        try:
            generate(t, VERSIONS[t])
        except Exception as e:
            print(f"!! {t} 실패: {type(e).__name__}: {e}", flush=True)
