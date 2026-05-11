"""
Forensic Analysis Module for PINIT Digital Vault
Provides image classification and forensic analysis capabilities
"""

from .service import ForensicService
from .routes import router as forensic_router

__version__ = "1.0.0"
__all__ = ["ForensicService", "forensic_router"]
