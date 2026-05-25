"""
backend/unified_forensics
==========================
Unified Forensic Intelligence Pipeline

Combines the existing document forensics module and the existing AI image
detection pipeline into a single fused verdict.  Neither existing module is
modified; this package only orchestrates them.

Route exported: POST /api/unified-forensics/analyze
               GET  /api/unified-forensics/health
"""

from .routes import router as unified_forensics_router   # noqa: F401

__all__ = ["unified_forensics_router"]
