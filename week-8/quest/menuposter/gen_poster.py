# -*- coding: utf-8 -*-
"""'두바이 피스타치오 소금빵' 신메뉴 포스터용 실사 히어로컷을 Gemini 2.5 Flash Image로 생성.
   - 텍스트는 이후 PIL로 정밀 합성하므로 여기서는 100% TEXT-FREE 실사 푸드샷만 생성.
   - 빵은 상단 55~60%에 배치, 하단은 텍스트용 부드러운 여백(아웃포커스 표면)으로 비워둠.
   - 세로 4:5 (인스타 포스터)."""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
MODEL = "gemini-2.5-flash-image"
client = genai.Client(api_key=KEY)

COMMON = (
    "ULTRA-PHOTOREALISTIC, appetizing DSLR food photography for a premium bakery-cafe new-menu POSTER. "
    "SUBJECT: a Korean-style SALT BREAD (shio-pan) reinvented as a DUBAI PISTACHIO dessert bread. "
    "A glossy, deeply golden-brown flaky salt-bread roll, torn/cut OPEN so a river of thick, vivid "
    "PISTACHIO-GREEN cream oozes out, packed with crunchy toasted golden KADAIF (kataifi) strands and "
    "crushed emerald pistachios, finished with a glossy pistachio drizzle on top and a scatter of "
    "flaky sea-salt crystals. Steam-fresh, buttery, rich, mouth-watering, extremely realistic texture — "
    "you can see the crisp shattered crust, soft airy crumb and the molten green filling. "
    "LIGHT: warm soft natural window light, gentle shadows, shallow depth of field, creamy background bokeh. "
    "COMPOSITION — VERY IMPORTANT: place the hero bread in the UPPER 60% of a VERTICAL frame. Keep the "
    "LOWER 40% as calm, clean, softly out-of-focus warm surface with LOTS of empty negative space and NO "
    "objects there, because menu text will be added below. "
    "CRITICAL — 100% TEXT-FREE: absolutely NO letters, numbers, words, captions, logos, menus, price tags, "
    "labels or watermarks anywhere. Do not render any text. "
    "Finish: editorial magazine food-photography quality, crisp, high resolution, natural realistic color, "
    "NOT illustrated, NOT cartoon, NOT 3D-render — a real photograph."
)

VERSIONS = {
    "v1": (
        COMMON + "\n\nSCENE A — HERO CUT-OPEN ON RUSTIC COUNTER:\n"
        "One single hero salt bread roll torn open at the top-center, front view at a slight 30-degree angle, "
        "sitting on a warm cream/oat-toned matte ceramic plate on a light rustic wooden bakery counter. "
        "A few crushed pistachios and kadaif crumbs scattered close around the bread. Soft creamy blurred "
        "warm background. Lower portion is smooth empty out-of-focus surface for text."
    ),
    "v2": (
        COMMON + "\n\nSCENE B — MACRO MELTY PULL:\n"
        "Extreme close-up macro of the salt bread pulled apart into two halves, thick pistachio-green cream "
        "and golden kadaif stretching/oozing between them, glistening. Dramatic soft side light on a moody "
        "warm dark-oat linen surface. The bread fills the upper area; the bottom fades into soft dark warm "
        "negative space for text."
    ),
}


def generate(tag, prompt):
    print(f"\n=== 생성: {tag} ===", flush=True)
    for ar in ("4:5", "3:4"):
        try:
            cfg = types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=ar),
            )
            resp = client.models.generate_content(model=MODEL, contents=[prompt], config=cfg)
            saved = None
            for cand in resp.candidates or []:
                for part in (cand.content.parts or []):
                    if getattr(part, "inline_data", None) and part.inline_data.data:
                        img = Image.open(io.BytesIO(part.inline_data.data))
                        out = HERE / f"hero_{tag}_raw.png"
                        img.save(out)
                        saved = out
                        print(f"저장: {out.name}  크기={img.size}  ar={ar}", flush=True)
                    elif getattr(part, "text", None):
                        print("모델 텍스트:", part.text[:200], flush=True)
            if saved:
                return saved
            print(f"!! {ar}: 이미지 파트 없음, 다음 비율 시도", flush=True)
        except Exception as e:
            print(f"!! {ar} 실패: {type(e).__name__}: {e}", flush=True)
    return None


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    targets = list(VERSIONS.keys()) if which == "all" else [which]
    for t in targets:
        generate(t, VERSIONS[t])
