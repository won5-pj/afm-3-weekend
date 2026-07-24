# -*- coding: utf-8 -*-
"""오딧세이(The Odyssey, 2026) 영화 포스터 재해석 — 텍스트프리 키아트 2종 생성.

Gemini 2.5 Flash Image. 2:3 세로 원시트 비율.
공식 티저 포스터(ref/ref_hires.jpg)는 '영화의 세계관/톤/의상·컬러그레이드' 레퍼런스로만
넣고, 구도는 원본을 베끼지 않은 완전히 새로운 오리지널 디자인을 지시한다.
제목/캐스트/개봉정보 타이포는 이후 PIL(overlay_poster.py) 단계에서 정밀 합성한다.
"""
import sys, io, pathlib
from google import genai
from google.genai import types
from PIL import Image

HERE = pathlib.Path(__file__).parent.parent            # movieposter/
KEY = (HERE / ".gemini_key.txt").read_text(encoding="utf-8").strip()
RAW = HERE / "raw"; RAW.mkdir(exist_ok=True)
REF = HERE / "ref" / "ref_hires.jpg"                    # 공식 티저(세계관 참조용)
MODEL = "gemini-2.5-flash-image"

client = genai.Client(api_key=KEY)
ref_part = types.Part.from_bytes(data=REF.read_bytes(), mime_type="image/jpeg")

COMMON = (
    "Create ORIGINAL cinematic movie-poster key art for an epic Greek-mythology film "
    "(a grounded, realistic reimagining of Homer's Odyssey in the vein of a Christopher "
    "Nolan IMAX epic). Photorealistic, shot on large-format 70mm film, rich natural "
    "texture, fine film grain, immense scale and gravity. \n"
    "USE THE ATTACHED official teaser poster ONLY as a reference for the film's WORLD, "
    "TONE, costume/armor design language and color grade — DO NOT copy its composition, "
    "its pine-forest setting, the small caped figure seen from behind, or the row of "
    "identical giants. Invent a COMPLETELY NEW, original composition as described below. \n"
    "CRITICAL — 100% TEXT-FREE: absolutely NO text, letters, numbers, logos, watermarks, "
    "captions or credits anywhere in the image. Faces of any hero must be obscured, "
    "backlit, silhouetted, helmeted or turned — do NOT depict any recognizable real "
    "celebrity's face. Leave the negative space described below clean and uncluttered so "
    "typography can be added later. Sharp, high resolution, professional. "
    "Vertical 2:3 theatrical one-sheet composition."
)

VERSIONS = {
    # ---- Style A: 차가운 심연/바다 — 놀란식 미니멀 티저 ----
    "a_sea": (
        COMMON + "\n\nCOMPOSITION A — 'THE SEA / THE ABYSS' (cold, minimal, awe):\n"
        "A single small lone ancient-Greek warrior stands at the bow of a battered wooden "
        "sailing ship, utterly dwarfed by a COLOSSAL churning storm-black ocean and a vast "
        "brooding pre-dawn sky. Enormous towering storm swells and a wall of dark water rise "
        "around the tiny ship; heavy sea mist and spray. \n"
        "PALETTE: cold and desaturated — deep teal, slate blue-grey, charcoal black, with a "
        "thin cold silver moon-rim light on the waves and one faint pale sliver of light on "
        "the far horizon. Overwhelming, lonely, monumental, dread. \n"
        "LAYOUT: place the ship and figure low, in the LOWER THIRD of the frame. Keep the "
        "ENTIRE UPPER HALF as vast, mostly-empty stormy-sky negative space for a title."
    ),
    # ---- Style B: 따뜻한 재/신 — 그랜드 에픽 'Defy the gods' ----
    "b_gods": (
        COMMON + "\n\nCOMPOSITION B — 'DEFY THE GODS' (warm, grand, defiant):\n"
        "Heroic dramatic LOW-ANGLE shot of a lone battle-worn ancient-Greek warrior king "
        "(face hidden in shadow / under a crested bronze helmet), weathered scarred bronze "
        "armor, muscular, gripping a spear, standing his ground and looking upward in "
        "defiance. TOWERING above and behind him, a COLOSSAL cracked ancient marble statue "
        "of a Greek god crumbles and dissolves into drifting ASH and glowing EMBERS, backlit "
        "by a fierce fiery amber sun breaking through smoke. \n"
        "PALETTE: warm and dramatic — bronze, amber gold, ember orange, ash grey, deep "
        "shadow black. Swirling ash, floating embers, strong volumetric god-rays, heat haze. "
        "Awe, doom, grandeur, defiance. \n"
        "LAYOUT: the warrior occupies the LOWER-CENTER third; keep the UPPER portion as "
        "darker smoky/ash negative space (the statue reads as a looming silhouette there) "
        "for a title."
    ),
}


def generate(tag, prompt):
    print(f"\n=== 생성: {tag} ===", flush=True)
    cfg = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="2:3"),
    )
    resp = client.models.generate_content(
        model=MODEL, contents=[prompt, ref_part], config=cfg
    )
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
