from PIL import Image
import os

logo_path = r"c:\Users\manish\Downloads\secure-sweet-access-main\secure-sweet-access-main\logo.png"
base_res = r"c:\Users\manish\Downloads\secure-sweet-access-main\secure-sweet-access-main\android\app\src\main\res"

# Load logo
logo = Image.open(logo_path).convert('RGBA')
print(f"✅ Loaded logo: {logo.size}")

# Foreground icon sizes for each density
icon_configs = [
    ('mipmap-mdpi', 48),
    ('mipmap-hdpi', 72),
    ('mipmap-xhdpi', 96),
    ('mipmap-xxhdpi', 144),
    ('mipmap-xxxhdpi', 192),
]

for folder, size in icon_configs:
    dest_path = os.path.join(base_res, folder, 'ic_launcher_foreground.png')
    
    # Resize logo to foreground size
    resized = logo.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(dest_path, 'PNG')
    
    print(f"✅ Created {folder}: {size}x{size} → ic_launcher_foreground.png")

print("\n✅ All foreground icons updated successfully!")
