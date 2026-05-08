#!/usr/bin/env python3
"""
Generate PINIT logo - blue/purple shield with checkmark
"""

from PIL import Image, ImageDraw
import math

# Create a new image with transparent background
size = 512
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Shield gradient colors (blue to purple)
color_light = (0, 150, 255, 255)      # Light blue
color_dark = (75, 0, 200, 255)        # Dark purple
color_white = (255, 255, 255, 255)    # White

# Draw shield shape (pentagon)
# Shield coordinates (points going clockwise)
margin = 30
top = margin
left = margin
right = size - margin
bottom = size - margin
middle_x = size // 2

# Shield points (approximate shield shape)
shield_points = [
    (middle_x, top),                           # Top point
    (right, top + 80),                         # Top right
    (right, top + 200),                        # Middle right
    (middle_x, bottom),                        # Bottom point (centered)
    (left, top + 200),                         # Middle left
    (left, top + 80),                          # Top left
]

# Draw shield with gradient effect (multiple overlapping circles)
# Create a radial gradient effect
for i in range(50):
    ratio = i / 50
    r = int(0 * (1 - ratio) + 75 * ratio)
    g = int(150 * (1 - ratio) + 0 * ratio)
    b = int(255 * (1 - ratio) + 200 * ratio)
    color = (r, g, b, 255)
    
    # Draw slightly offset rectangle to create gradient
    offset = i * 2
    draw.rectangle([
        (middle_x - 200 + offset, top + offset),
        (middle_x + 200 - offset, bottom - offset)
    ], fill=color)

# Draw shield outline
draw.polygon(shield_points, fill=(0, 100, 200, 255), outline=(0, 50, 150, 255))

# Draw inner shield (lighter)
inner_margin = 20
inner_points = [
    (middle_x, top + inner_margin),
    (right - inner_margin, top + 80),
    (right - inner_margin, top + 200),
    (middle_x, bottom - inner_margin),
    (left + inner_margin, top + 200),
    (left + inner_margin, top + 80),
]
draw.polygon(inner_points, fill=(50, 150, 255, 255))

# Draw checkmark
check_size = 120
check_x = middle_x
check_y = middle_x

# Checkmark points (drawn with white)
# Left part of check (going down-right)
check_left_start = (check_x - 50, check_y - 20)
check_left_end = (check_x, check_y + 40)

# Right part of check (going up-right)
check_right_start = (check_x, check_y + 40)
check_right_end = (check_x + 70, check_y - 30)

# Draw checkmark with thick white line
line_width = 16
for offset in range(-line_width//2, line_width//2):
    # Left portion
    draw.line([
        (check_left_start[0], check_left_start[1] + offset),
        (check_left_end[0], check_left_end[1] + offset)
    ], fill=color_white, width=3)
    
    # Right portion
    draw.line([
        (check_right_start[0], check_right_start[1] + offset),
        (check_right_end[0], check_right_end[1] + offset)
    ], fill=color_white, width=3)

# Draw checkmark with better approach
draw.line([check_left_start, check_left_end], fill=color_white, width=line_width)
draw.line([check_left_end, check_right_end], fill=color_white, width=line_width)

# Save the image
img.save('logo.png')
print("✅ PINIT logo created: logo.png")
print(f"   Size: {size}x{size}")
print("   Format: PNG with transparent background")
