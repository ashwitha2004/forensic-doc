"""
AES-256-GCM File Encryption / Decryption
==========================================
Encrypts raw file bytes before Supabase storage.
Every upload gets a fresh 12-byte IV; authentication tag (16 bytes)
is appended automatically by GCM and verified on decrypt.

Wire format (all stored as base64 in the DB):
  MAGIC(9)  |  IV(12)  |  CIPHERTEXT  |  AUTH-TAG(16)

MAGIC prefix lets the decrypt side safely detect whether data is
encrypted (new records) or plain base64 (legacy records written
before encryption was enabled) — giving backward compatibility.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# 9-byte magic header — distinguishes encrypted blobs from plain base64
_MAGIC = b"AESENC_V1"

# Environment variable name that holds the 64-hex-char (32-byte) key
_KEY_ENV = "VAULT_ENCRYPTION_KEY"


def _load_key() -> bytes:
    """Load the 256-bit AES key from the environment."""
    hex_key = os.environ.get(_KEY_ENV, "").strip()

    if len(hex_key) == 64:
        try:
            return bytes.fromhex(hex_key)
        except ValueError:
            pass  # fall through to error

    # Key missing or malformed — log a loud warning so it is never silently ignored
    logger.error(
        "[AES] %s is missing or not a 64-char hex string. "
        "Vault encryption is DISABLED for this session. "
        "Set a valid key in backend/.env to enable encryption.",
        _KEY_ENV,
    )
    return b""   # sentinel: empty key → cipher will refuse to operate


# Module-level key — loaded once at import time (after dotenv is applied by main.py)
_KEY: bytes = b""   # populated lazily on first call via _get_key()


def _get_key() -> bytes:
    """Return the encryption key, re-loading from env if needed (supports hot-reload)."""
    global _KEY
    if _KEY:
        return _KEY
    _KEY = _load_key()
    return _KEY


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def encrypt_bytes(plaintext: bytes) -> bytes:
    """
    AES-256-GCM encrypt *plaintext* and return the encrypted blob.

    Returns:  MAGIC(9) || IV(12) || CIPHERTEXT+TAG
    Raises:   RuntimeError if the encryption key is not configured.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _get_key()
    if not key:
        raise RuntimeError(
            f"Vault encryption key not set — add {_KEY_ENV}=<64-hex-chars> to backend/.env"
        )

    iv = os.urandom(12)          # 96-bit nonce (recommended for GCM)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)   # GCM appends 16-byte tag

    encrypted = _MAGIC + iv + ciphertext

    logger.info(
        "[AES] encrypt success — plaintext %d B → encrypted %d B",
        len(plaintext), len(encrypted),
    )
    return encrypted


def decrypt_bytes(data: bytes) -> bytes:
    """
    AES-256-GCM decrypt *data*.

    Accepts blobs with or without the MAGIC prefix (backward-compatible).
    Raises:   RuntimeError if the key is missing.
              cryptography.exceptions.InvalidTag if the ciphertext is tampered.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _get_key()
    if not key:
        raise RuntimeError(
            f"Vault encryption key not set — add {_KEY_ENV}=<64-hex-chars> to backend/.env"
        )

    # Strip magic prefix if present
    payload = data[len(_MAGIC):] if data.startswith(_MAGIC) else data

    iv         = payload[:12]
    ciphertext = payload[12:]

    aesgcm    = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext, None)

    logger.info(
        "[AES] decrypt success — encrypted %d B → plaintext %d B",
        len(data), len(plaintext),
    )
    return plaintext


def is_encrypted(data: bytes) -> bool:
    """Return True if *data* was produced by encrypt_bytes() (has the MAGIC header)."""
    return data.startswith(_MAGIC)
