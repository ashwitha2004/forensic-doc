import cloudinary
import cloudinary.uploader
import cloudinary.api
from dotenv import load_dotenv
import os
import base64
import httpx

load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key    = os.getenv("CLOUDINARY_API_KEY"),
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure     = True
)

FOLDER = os.getenv("CLOUDINARY_FOLDER", "pinit-thumbnails")


def upload_thumbnail(file_bytes: bytes, asset_id: str) -> dict:
    """
    Upload image thumbnail to Cloudinary.
    Returns { url, public_id, width, height }
    """
    try:
        result = cloudinary.uploader.upload(
            file_bytes,
            public_id      = f"{FOLDER}/{asset_id}",
            folder         = FOLDER,
            overwrite      = True,
            resource_type  = "image",
            transformation = [
                {
                    "width":   400,
                    "height":  400,
                    "crop":    "limit",    # shrink if larger, never enlarge
                    "quality": "auto",     # Cloudinary auto-optimises
                    "fetch_format": "auto" # serve webp to modern browsers
                }
            ]
        )
        return {
            "success"   : True,
            "url"       : result["secure_url"],
            "public_id" : result["public_id"],
            "width"     : result.get("width"),
            "height"    : result.get("height"),
        }
    except Exception as e:
        return {
            "success" : False,
            "error"   : str(e),
            "url"     : None
        }


def upload_thumbnail_base64(base64_str: str, asset_id: str) -> dict:
    """
    Upload from base64 string (what your React app sends as thumbnail).
    base64_str can be a full data URL like data:image/jpeg;base64,/9j/...
    """
    try:
        # Validate Cloudinary configuration first
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
        api_key = os.getenv("CLOUDINARY_API_KEY")
        api_secret = os.getenv("CLOUDINARY_API_SECRET")
        
        if not all([cloud_name, api_key, api_secret]):
            print(f"⚠️ Cloudinary config missing: cloud_name={bool(cloud_name)}, api_key={bool(api_key)}, api_secret={bool(api_secret)}")
            return {
                "success": False,
                "error": "Cloudinary not configured on server",
                "url": None
            }
        
        # Validate base64 string
        if not base64_str:
            print("⚠️ Base64 string is empty")
            return {"success": False, "error": "No image data provided", "url": None}
        
        # Clean base64 if it's a data URL
        if base64_str.startswith("data:"):
            base64_str = base64_str.split(",")[1]
            print(f"📝 Cleaned base64 data URL, new length: {len(base64_str)}")
        
        print(f"⬆️ Uploading to Cloudinary - folder: {FOLDER}, asset_id: {asset_id}, base64_len: {len(base64_str)}")
        
        result = cloudinary.uploader.upload(
            base64_str,
            public_id      = f"{FOLDER}/{asset_id}",
            folder         = FOLDER,
            overwrite      = True,
            resource_type  = "image",
            transformation = [
                {
                    "width":   400,
                    "height":  400,
                    "crop":    "limit",
                    "quality": "auto",
                    "fetch_format": "auto"
                }
            ]
        )
        
        url = result["secure_url"]
        print(f"✅ Cloudinary upload successful - URL: {url}")
        
        return {
            "success"   : True,
            "url"       : url,
            "public_id" : result["public_id"],
            "width"     : result.get("width"),
            "height"    : result.get("height"),
        }
    except Exception as e:
        error_str = str(e)
        print(f"❌ Cloudinary upload failed: {error_str}")
        return {
            "success" : False,
            "error"   : f"Cloudinary upload failed: {error_str}",
            "url"     : None
        }


def delete_thumbnail(asset_id: str) -> bool:
    """
    Delete image from Cloudinary when asset is removed from vault.
    """
    try:
        result = cloudinary.uploader.destroy(
            f"{FOLDER}/{asset_id}",
            resource_type = "image"
        )
        return result.get("result") == "ok"
    except Exception as e:
        print(f"Cloudinary delete error: {e}")
        return False


def get_thumbnail_url(asset_id: str) -> str:
    """
    Get the public URL for a stored thumbnail.
    """
    return cloudinary.CloudinaryImage(
        f"{FOLDER}/{asset_id}"
    ).build_url(
        width        = 400,
        height       = 400,
        crop         = "limit",
        quality      = "auto",
        fetch_format = "auto",
        secure       = True
    )


def download_image(asset_id: str) -> dict:
    """
    Download full-resolution image from Cloudinary as bytes.
    Returns { success, data (bytes), format, error, debug_info }
    """
    try:
        print(f"📥 Cloudinary Download: Starting for asset_id={asset_id}")
        
        # Verify Cloudinary is configured
        if not os.getenv("CLOUDINARY_CLOUD_NAME"):
            error_msg = "Cloudinary not configured: CLOUDINARY_CLOUD_NAME missing"
            print(f"❌ {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "data": None,
                "format": None
            }
        
        print(f"✅ Cloudinary Cloud: {os.getenv('CLOUDINARY_CLOUD_NAME')}")
        
        # Build URL for full-resolution image (no resize)
        url = cloudinary.CloudinaryImage(
            f"{FOLDER}/{asset_id}"
        ).build_url(
            quality      = "auto",
            fetch_format = "auto",
            secure       = True
        )
        print(f"🔗 Cloudinary URL: {url}")
        
        # Download the image using httpx with longer timeout
        print(f"⏳ Downloading from Cloudinary (timeout=60s)...")
        response = httpx.get(url, timeout=60)
        print(f"📊 Response status: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"Cloudinary returned status {response.status_code}"
            print(f"❌ {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "data": None,
                "format": None
            }
        
        response.raise_for_status()
        
        # Detect format from Content-Type header
        content_type = response.headers.get("content-type", "image/jpeg")
        format_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
        }
        file_format = format_map.get(content_type, "jpg")
        
        print(f"📷 Downloaded: {len(response.content)} bytes, format={file_format}")
        
        return {
            "success": True,
            "data": response.content,
            "format": file_format,
            "content_type": content_type
        }
    except httpx.TimeoutException as e:
        error_msg = f"Timeout downloading from Cloudinary: {str(e)}"
        print(f"❌ {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "data": None,
            "format": None
        }
    except httpx.HTTPError as e:
        error_msg = f"HTTP error from Cloudinary: {str(e)}"
        print(f"❌ {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "data": None,
            "format": None
        }
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(f"❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": error_msg,
            "data": None,
            "format": None
        }