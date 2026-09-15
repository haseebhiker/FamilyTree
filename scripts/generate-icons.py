from PIL import Image
import os

SRC = r"C:\Users\hasee\Downloads\2004_08_aug_n_-022_2671318662_o.jpg"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

def crop_square(img):
    # Crop centered on the face (turban top through mid-beard), not the
    # whole oval — the first attempt included too much empty background
    # above the turban, pushing the face off-center in the final icon.
    box = (110, 110, 670, 670)  # left, top, right, bottom -> 560x560 square
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
