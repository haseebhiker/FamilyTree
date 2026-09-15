from PIL import Image
import os

SRC = r"C:\Users\hasee\.claude\uploads\c552ecf8-69af-43c3-8fc1-cb7821d49db0\b2be2e53-image.jpg"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

def crop_square(img):
    # Colorized portrait in an oval frame — crop centered on the face
    # (turban top through beard), tight enough to keep the tan frame
    # corners minimal without cutting into the garland.
    box = (140, 90, 700, 650)  # left, top, right, bottom -> 560x560 square
    return img.crop(box)

def make_icon(square, size, filename):
    resized = square.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(OUT_DIR, filename))
    print(f"wrote {filename} ({size}x{size})")

img = Image.open(SRC).convert("RGB")
square = crop_square(img)
square.save(os.path.join(OUT_DIR, "icon-preview.png"))
make_icon(square, 192, "icon-192.png")
make_icon(square, 512, "icon-512.png")
make_icon(square, 180, "apple-touch-icon.png")
