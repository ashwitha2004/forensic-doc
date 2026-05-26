"""
Unified Fusion Engine
=====================
Combines document-forensics scores with AI-detection scores into a single
fused verdict.

Design
------
* Document forensics contribution:  40 % of total score
* AI-generation detection:          60 % of total score  (images/PDF pages)

When the file is a plain-text document (TXT / DOCX analysed purely as text)
the AI branch is unavailable; its weight is redistributed to document forensics.

Verdict thresholds (fused_score 0-1):
    >= 0.65 AND confidence >= 0.45  →  "Likely Tampered / AI-Generated"
    >= 0.40 AND confidence >= 0.30  →  "Suspicious"
    otherwise                       →  "Authentic / Clean"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ─── Output Schema ────────────────────────────────────────────────────────────

@dataclass
class UnifiedVerdict:
    verdict:          str            # "Authentic / Clean" | "Suspicious" | "Likely Tampered / AI-Generated"
    fused_score:      float          # 0.0–1.0  (higher = more suspicious)
    confidence:       float          # 0.0–1.0
    ai_probability:   float          # 0.0–100.0  (from AI branch, or 50 if unavailable)
    doc_tamper_prob:  float          # 0.0–1.0    (from document forensics)
    dominant_signals: List[str]      = field(default_factory=list)
    signal_breakdown: Dict[str, Any] = field(default_factory=dict)
    ai_branch_used:   bool           = True
    doc_branch_used:  bool           = True
    ai_error:         Optional[str]  = None
    doc_error:        Optional[str]  = None


# ─── Fusion Logic ─────────────────────────────────────────────────────────────

def fuse_results(
    ai_result:  Optional[Dict[str, Any]],
    doc_result: Optional[Any],          # DocumentForensicsResult dataclass or None
) -> UnifiedVerdict:
    """
    Fuse AI detection + document forensics into a single verdict.

    Parameters
    ----------
    ai_result   Output of ai_runner.run_ai_detection() — or None if unavailable.
    doc_result  Output of document_forensics.pipeline.run_document_forensics()
                — or None if unavailable.
    """
    ai_ok  = ai_result  is not None and ai_result.get("error") is None
    doc_ok = doc_result is not None and getattr(doc_result, "error", None) is None

    # ── Extract AI branch values ──────────────────────────────────────────────
    if ai_ok:
        ai_prob    = float(ai_result["ai_probability"])      / 100.0   # → 0-1
        ai_conf    = float(ai_result["fusion_confidence"])   / 100.0
        ai_signals = list(ai_result.get("dominant_signals", []))
        ai_err     = None
    else:
        ai_prob    = 0.50
        ai_conf    = 0.0
        ai_signals = []
        ai_err     = (ai_result or {}).get("error", "AI branch unavailable")

    # ── Extract Document Forensics branch values ──────────────────────────────
    if doc_ok:
        doc_prob    = float(getattr(doc_result, "tamper_probability", 0.0))
        doc_conf    = float(getattr(doc_result, "confidence",          0.0))
        doc_verdict = str(getattr(doc_result,   "verdict", ""))
        doc_signals = _doc_signals(doc_result)
        doc_err     = None
    else:
        doc_prob    = 0.0
        doc_conf    = 0.0
        doc_verdict = ""
        doc_signals = []
        doc_err     = getattr(doc_result, "error", "Document forensics unavailable") if doc_result else "Document forensics unavailable"

    # ── Dynamic weights ───────────────────────────────────────────────────────
    if ai_ok and doc_ok:
        w_ai  = 0.60
        w_doc = 0.40
    elif ai_ok:
        w_ai  = 1.00
        w_doc = 0.00
    elif doc_ok:
        w_ai  = 0.00
        w_doc = 1.00
    else:
        # Nothing available — return neutral result
        return UnifiedVerdict(
            verdict          = "Authentic / Clean",
            fused_score      = 0.0,
            confidence       = 0.0,
            ai_probability   = 50.0,
            doc_tamper_prob  = 0.0,
            dominant_signals = [],
            ai_branch_used   = False,
            doc_branch_used  = False,
            ai_error         = ai_err,
            doc_error        = doc_err,
        )

    fused_score = w_ai * ai_prob + w_doc * doc_prob
    confidence  = w_ai * ai_conf + w_doc * doc_conf

    # ── Verdict thresholds ────────────────────────────────────────────────────
    if fused_score >= 0.65 and confidence >= 0.45:
        verdict = "Likely Tampered / AI-Generated"
    elif fused_score >= 0.40 and confidence >= 0.30:
        verdict = "Suspicious"
    else:
        verdict = "Authentic / Clean"

    # ── Dominant signals (merged, deduplicated) ───────────────────────────────
    all_signals = ai_signals + doc_signals
    seen: dict[str, int] = {}
    for s in all_signals:
        seen[s] = seen.get(s, 0) + 1
    dominant = [s for s, _ in sorted(seen.items(), key=lambda x: -x[1])][:6]

    # ── Signal breakdown ──────────────────────────────────────────────────────
    breakdown: Dict[str, Any] = {
        "ai_probability_pct":  round(ai_prob  * 100, 1),
        "doc_tamper_prob_pct": round(doc_prob * 100, 1),
        "ai_confidence_pct":   round(ai_conf  * 100, 1),
        "doc_confidence_pct":  round(doc_conf * 100, 1),
        "weight_ai":           round(w_ai  * 100, 0),
        "weight_doc":          round(w_doc * 100, 0),
        "doc_verdict":         doc_verdict,
    }
    if ai_ok:
        breakdown["ai_signal_breakdown"] = ai_result.get("signal_breakdown", {})
    if doc_ok:
        sigs = getattr(doc_result, "signals", None)
        if sigs:
            breakdown["doc_signals"] = {
                "ela_score":             getattr(sigs, "ela_score",             0.0),
                "noise_inconsistency":   getattr(sigs, "noise_inconsistency",   0.0),
                "layout_anomaly":        getattr(sigs, "layout_anomaly",        0.0),
                "metadata_suspicion":    getattr(sigs, "metadata_suspicion",    0.0),
                "text_anomaly":          getattr(sigs, "text_anomaly",          0.0),
            }

    return UnifiedVerdict(
        verdict          = verdict,
        fused_score      = round(fused_score, 4),
        confidence       = round(confidence,  4),
        ai_probability   = round(ai_prob * 100, 1),
        doc_tamper_prob  = round(doc_prob,      4),
        dominant_signals = dominant,
        signal_breakdown = breakdown,
        ai_branch_used   = ai_ok,
        doc_branch_used  = doc_ok,
        ai_error         = ai_err,
        doc_error        = doc_err,
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _doc_signals(doc_result: Any) -> List[str]:
    """Extract human-readable signal names from document forensics result."""
    signals: List[str] = []
    sigs = getattr(doc_result, "signals", None)
    if sigs is None:
        return signals

    thresholds = {
        "ela_score":           (0.35, "ELA compression anomaly"),
        "noise_inconsistency": (0.35, "Noise inconsistency"),
        "layout_anomaly":      (0.30, "Layout anomaly"),
        "metadata_suspicion":  (0.40, "Suspicious metadata"),
        "text_anomaly":        (0.30, "Text anomaly"),
    }
    for attr, (thresh, label) in thresholds.items():
        val = getattr(sigs, attr, 0.0)
        if isinstance(val, (int, float)) and val >= thresh:
            signals.append(label)

    return signals
