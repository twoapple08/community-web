# 안드로이드 앱 아이콘·시작 화면 이미지 만들기
# 실행: python3 apps/android/scripts/make_icons.py   (Pillow 필요: pip install pillow)
# 원본: apps/assets/icon-1024.png, icon-foreground-1024.png, splash-2732.png (apps/assets/make_base_icons.py 로 만듦)
# 결과물은 android/app/src/main/res 아래에 커밋되어 있으므로 로고를 바꿀 때만 다시 실행하면 됩니다.
# (알림 아이콘 ic_stat_notify 는 흰색 벡터라서 res/drawable/ic_stat_notify.xml 에 직접 들어 있음)
from pathlib import Path

from PIL import Image, ImageDraw

APP_DIR = Path(__file__).resolve().parents[1]  # apps/android
ASSETS = APP_DIR.parent / "assets"  # apps/assets
RES = APP_DIR / "android" / "app" / "src" / "main" / "res"

icon_full = Image.open(ASSETS / "icon-1024.png").convert("RGBA")  # 흰 정사각형 + 로고
icon_fg = Image.open(ASSETS / "icon-foreground-1024.png").convert("RGBA")  # 투명 + 로고 (적응형 아이콘 안전 영역 안)
splash_src = Image.open(ASSETS / "splash-2732.png").convert("RGBA")  # 흰 배경 + 가운데 로고

WHITE = (255, 255, 255, 255)
SUPERSAMPLE = 4  # 둥근 모서리 테두리를 매끄럽게 하려고 크게 그린 뒤 줄임

# 밀도별 배율 (mdpi = 1)
DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print("  ", path.relative_to(APP_DIR))


def shape_mask(size: int, shape: str, margin_ratio: float) -> Image.Image:
    """흰 바탕 모양(둥근 사각형/원) 마스크. margin_ratio = 바깥 투명 여백 비율"""
    big = size * SUPERSAMPLE
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    margin = round(big * margin_ratio)
    box = (margin, margin, big - 1 - margin, big - 1 - margin)
    if shape == "circle":
        draw.ellipse(box, fill=255)
    else:
        radius = round((big - 2 * margin) * 0.18)
        draw.rounded_rectangle(box, radius=radius, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def legacy_icon(size: int, shape: str) -> Image.Image:
    """안드로이드 7.x(적응형 아이콘 이전) 런처용 아이콘: 흰 바탕 모양 위에 로고
    - 둥근 사각형(ic_launcher): icon-1024.png(흰 정사각형 + 로고)를 그대로 둥글게 자름
    - 원형(ic_launcher_round): 원에서는 icon-1024 의 로고 끝이 테두리에 너무 붙으므로,
      적응형 전경 이미지의 보이는 영역(108dp 중 가운데 72dp)을 써서 적응형 아이콘과 같은 여백으로 맞춤"""
    margin_ratio = 0.04
    inner = round(size * (1 - 2 * margin_ratio))
    offset = (size - inner) // 2
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if shape == "circle":
        base = Image.new("RGBA", (size, size), WHITE)
        canvas.paste(base, (0, 0), shape_mask(size, shape, margin_ratio))
        crop = round(icon_fg.width * (18 / 108))
        logo_area = icon_fg.crop((crop, crop, icon_fg.width - crop, icon_fg.height - crop))
        canvas.alpha_composite(logo_area.resize((inner, inner), Image.LANCZOS), (offset, offset))
    else:
        full = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        full.paste(icon_full.resize((inner, inner), Image.LANCZOS), (offset, offset))
        canvas.paste(full, (0, 0), shape_mask(size, shape, margin_ratio))
    return canvas


def cover_crop(image: Image.Image, width: int, height: int) -> Image.Image:
    """비율이 다른 화면에 맞게 가운데를 잘라 낸 뒤 크기 조절 (시작 화면용)"""
    src_w, src_h = image.size
    target_ratio = width / height
    if src_w / src_h > target_ratio:
        crop_w = round(src_h * target_ratio)
        left = (src_w - crop_w) // 2
        box = (left, 0, left + crop_w, src_h)
    else:
        crop_h = round(src_w / target_ratio)
        top = (src_h - crop_h) // 2
        box = (0, top, src_w, top + crop_h)
    return image.crop(box).resize((width, height), Image.LANCZOS)


def main() -> None:
    print("런처 아이콘")
    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        legacy = round(48 * scale)
        save_png(legacy_icon(legacy, "rounded"), folder / "ic_launcher.png")
        save_png(legacy_icon(legacy, "circle"), folder / "ic_launcher_round.png")
        # 적응형 아이콘 전경 (108dp, 흰 배경색은 values/ic_launcher_background.xml)
        foreground = round(108 * scale)
        save_png(icon_fg.resize((foreground, foreground), Image.LANCZOS), folder / "ic_launcher_foreground.png")

    print("시작 화면 (안드로이드 12 미만·플러그인 표시용)")
    # 세로 화면 기준 크기 (mdpi 320x480 ~ xxxhdpi 1280x1920), 가로 화면은 가로·세로를 바꿈
    portrait_sizes = {
        "mdpi": (320, 480),
        "hdpi": (480, 800),
        "xhdpi": (720, 1280),
        "xxhdpi": (960, 1600),
        "xxxhdpi": (1280, 1920),
    }
    for name, (w, h) in portrait_sizes.items():
        save_png(cover_crop(splash_src, w, h).convert("RGB"), RES / f"drawable-port-{name}" / "splash.png")
        save_png(cover_crop(splash_src, h, w).convert("RGB"), RES / f"drawable-land-{name}" / "splash.png")
    save_png(cover_crop(splash_src, 480, 320).convert("RGB"), RES / "drawable" / "splash.png")
    print("ok")


if __name__ == "__main__":
    main()
