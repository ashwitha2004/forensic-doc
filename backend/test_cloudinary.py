import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
import os

load_dotenv()

cloudinary.config(
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key    = os.getenv("CLOUDINARY_API_KEY"),
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure     = True
)

print("Testing Cloudinary connection...")

# Create a tiny red 10x10 pixel PNG in memory — no internet needed
import struct, zlib

def make_tiny_png():
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    signature = b'\x89PNG\r\n\x1a\n'
    IHDR = chunk(b'IHDR', struct.pack('>IIBBBBB', 10, 10, 8, 2, 0, 0, 0))
    raw  = b''.join(b'\x00\xff\x00\x00' * 10 for _ in range(10))  # red pixels
    IDAT = chunk(b'IDAT', zlib.compress(raw))
    IEND = chunk(b'IEND', b'')
    return signature + IHDR + IDAT + IEND

image_bytes = make_tiny_png()

# Upload to Cloudinary
result = cloudinary.uploader.upload(
    image_bytes,
    public_id     = "pinit-thumbnails/test-image",
    folder        = "pinit-thumbnails",
    overwrite     = True,
    resource_type = "image"
)

print(f"Upload successful!")
print(f"URL: {result['secure_url']}")
print(f"Public ID: {result['public_id']}")

# Clean up
cloudinary.uploader.destroy("pinit-thumbnails/test-image")
print("Test image deleted — cleanup done")
print("Cloudinary is ready!")