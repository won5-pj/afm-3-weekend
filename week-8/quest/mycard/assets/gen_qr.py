# -*- coding: utf-8 -*-
"""명함 뒷면용 QR 생성 — 스캔하면 연락처(vCard)가 저장된다."""
import pathlib
import qrcode
from qrcode.constants import ERROR_CORRECT_M

HERE = pathlib.Path(__file__).parent

# 실제로 동작하는 vCard (스캔 → 연락처 저장)
VCARD = (
    "BEGIN:VCARD\n"
    "VERSION:3.0\n"
    "N:오상원\n"
    "FN:오상원\n"
    "TITLE:사원\n"
    "ORG:TLS\n"
    "TEL;TYPE=CELL:010-2574-8001\n"
    "EMAIL:dennisoh.au@gmail.com\n"
    "ADR;TYPE=WORK:;;서울 종로구;;;;대한민국\n"
    "NOTE:나를 한 단어로 정의하면 — 성장(Growth)\n"
    "END:VCARD\n"
)

DARK = "#0E3B2E"   # 딥 그린 (스캔 잘 되도록 충분히 어둡게)
LIGHT = "#FFFFFF"

def build():
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=20,
        border=2,
    )
    qr.add_data(VCARD)
    qr.make(fit=True)

    # 우선 라운드 스타일 시도, 실패 시 기본 스타일
    try:
        from qrcode.image.styledpil import StyledPilImage
        from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
        from qrcode.image.styles.colormasks import SolidFillColorMask
        img = qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=RoundedModuleDrawer(radius_ratio=1.0),
            color_mask=SolidFillColorMask(
                back_color=(255, 255, 255),
                front_color=(14, 59, 46),
            ),
        )
        style = "rounded"
    except Exception as e:
        print("rounded 실패, plain 사용:", e)
        img = qr.make_image(fill_color=DARK, back_color=LIGHT)
        style = "plain"

    out = HERE / "qr.png"
    img.save(out)
    print(f"QR 저장: {out}  스타일={style}  크기={img.size}")

if __name__ == "__main__":
    build()
