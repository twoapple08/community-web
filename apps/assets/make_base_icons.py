# 앱 아이콘 원본 만들기 (사이트 로고 public/logo-community.png → 흰 배경 정사각형)
# 실행: python3 apps/assets/make_base_icons.py   (Pillow 필요)
# 결과물은 커밋되어 있으므로 로고를 바꿀 때만 다시 실행하면 됩니다.
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
logo = Image.open(ROOT / "public" / "logo-community.png").convert("RGBA")
logo = logo.crop(logo.getbbox())


def place(canvas_size: int, logo_width_ratio: float, background):
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    w = round(canvas_size * logo_width_ratio)
    h = round(w * logo.height / logo.width)
    resized = logo.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((canvas_size - w) // 2, (canvas_size - h) // 2))
    return canvas


WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
# 일반 아이콘 (윈도우 / 안드로이드 기존형): 흰 정사각형 위에 여백을 두고 로고
place(1024, 0.78, WHITE).save(OUT / "icon-1024.png")
# 안드로이드 적응형 아이콘 전경 (투명). 기기마다 원/둥근사각형으로 잘리므로 가운데 안전 영역(지름 61%) 안에 들어가도록
place(1024, 0.50, CLEAR).save(OUT / "icon-foreground-1024.png")
# 시작 화면용 (흰 배경 가운데 로고)
place(2732, 0.30, WHITE).save(OUT / "splash-2732.png")
print("ok")
