from PIL import Image
import os

SRC = r"C:\Users\hasee\Downloads\2004_08_aug_n_-022_2671318662_o.jpg"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

def crop_square(img):
    # Crop to the oval portrait area (headshot), leaving out the mat border.
    box = (45, 15, 635, 605)  # left, top, right, bottom -> 590x590 square
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
