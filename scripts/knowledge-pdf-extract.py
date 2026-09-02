#!/usr/bin/env python3
"""Extract page text and page boxes from a PDF without rewriting the source."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


def text_quality(text: str) -> dict:
    compact = re.sub(r"\s+", "", text or "")
    meaningful = re.findall(r"[\u3400-\u9fffA-Za-z0-9]", compact)
    replacement = compact.count("\ufffd") + sum(1 for char in compact if ord(char) < 32)
    private_use = sum(1 for char in compact if 0xE000 <= ord(char) <= 0xF8FF)
    ratio = len(meaningful) / max(1, len(compact))
    readable = len(meaningful) >= 30 and (ratio >= 0.45 or (len(meaningful) >= 80 and ratio >= 0.30)) and replacement / max(1, len(compact)) < 0.03 and private_use / max(1, len(compact)) < 0.15
    score = min(100, round(len(meaningful) / 4))
    if ratio < 0.45:
        score = min(score, round(ratio * 100))
    if replacement:
        score = max(0, score - min(40, replacement * 4))
    return {
        "characterCount": len(text or ""),
        "meaningfulCount": len(meaningful),
        "meaningfulRatio": round(ratio, 4),
        "replacementCount": replacement,
        "privateUseCount": private_use,
        "score": score,
        "readable": readable,
    }


def box_values(box) -> list[float]:
    return [round(float(box.left), 3), round(float(box.bottom), 3), round(float(box.right), 3), round(float(box.top), 3)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--max-pages", type=int, default=0)
    args = parser.parse_args()

    source = Path(args.source)
    output = Path(args.output)
    reader = PdfReader(str(source), strict=False)
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as error:
            raise RuntimeError("PDF已加密，需要密码后才能解析") from error

    page_limit = min(len(reader.pages), args.max_pages) if args.max_pages > 0 else len(reader.pages)
    pages = []
    for index in range(page_limit):
        page = reader.pages[index]
        error_message = ""
        try:
            text = (page.extract_text() or "").replace("\x00", "").replace("\r", "").strip()
        except Exception as error:
            text = ""
            error_message = str(error)[:500]
        quality = text_quality(text)
        pages.append({
            "page": index + 1,
            "text": text,
            "nativeTextQuality": quality,
            "needsOcr": not quality["readable"],
            "mediaBox": box_values(page.mediabox),
            "cropBox": box_values(page.cropbox),
            "rotation": int(page.get("/Rotate", 0) or 0),
            "errorMessage": error_message,
        })

    payload = {
        "schemaVersion": "qms-pdf-page-extraction-v1",
        "source": str(source),
        "pageCount": len(reader.pages),
        "processedPageCount": page_limit,
        "pages": pages,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"pageCount": len(reader.pages), "processedPageCount": page_limit}, ensure_ascii=False))


if __name__ == "__main__":
    main()
