#!/usr/bin/env python3
"""
Script to resize and set up Android launcher icons
Requirements: pip install Pillow
"""

from PIL import Image
import os
from pathlib import Path

# Icon sizes for Android (in pixels)
ICON_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

def setup_icons(source_image_path, target_dir):
    """
    Resize source image to all Android icon sizes
    
    Args:
        source_image_path: Path to source image (PNG recommended)
        target_dir: Base directory where mipmap folders are located
    """
    
    # Open source image
    try:
        img = Image.open(source_image_path)
        print(f"✅ Loaded image: {source_image_path}")
        print(f"   Size: {img.size}")
    except Exception as e:
        print(f"❌ Error loading image: {e}")
        return False
    
    # Ensure image is RGBA (supports transparency)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
        print("✅ Converted to RGBA")
    
    # Resize and save for each density
    for density, size in ICON_SIZES.items():
        # Create resized icon
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Save to appropriate directory
        target_path = Path(target_dir) / density / 'ic_launcher.png'
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        resized.save(target_path, 'PNG')
        print(f"✅ Created {density}: {size}x{size} → {target_path}")
    
    # Also update round icons if they exist
    for density, size in ICON_SIZES.items():
        target_path = Path(target_dir) / density / 'ic_launcher_round.png'
        if target_path.parent.exists():
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(target_path, 'PNG')
            print(f"✅ Created {density} (round): {size}x{size} → {target_path}")
    
    print("\n✅ All icons created successfully!")
    return True

if __name__ == '__main__':
    # Paths - try multiple locations
    current_dir = os.getcwd()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Try to find logo.png
    possible_paths = [
        os.path.join(current_dir, 'logo.png'),
        os.path.join(script_dir, 'logo.png'),
        'logo.png'
    ]
    
    source_image = None
    for path in possible_paths:
        if os.path.exists(path):
            source_image = path
            print(f"✅ Found logo at: {path}")
            break
    
    if source_image is None:
        print(f"❌ Logo not found in any of these locations:")
        for path in possible_paths:
            print(f"   - {path}")
        print("\nTo use this script:")
        print("1. Save your logo image as 'logo.png' in the project folder")
        print("2. Then run: python setup_icons.py")
        print("\nProject folder should be: c:\\Users\\manish\\Downloads\\secure-sweet-access-main\\secure-sweet-access-main")
    else:
        target_dir = os.path.join(script_dir, 'android/app/src/main/res')
        setup_icons(source_image, target_dir)
