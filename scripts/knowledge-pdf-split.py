#!/usr/bin/env python3
"""Split a large PDF into bounded page chunks for background processing."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from pypdf import PdfReader, PdfWriter

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output_dir")
    parser.add_argument("--chunk-pages", type=int, default=150)
    args = parser.parse_args()
    source = Path(args.source)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(source), strict=False)
    total = len(reader.pages)
    chunks = []
    for start in range(0, total, max(1, args.chunk_pages)):
        end = min(total, start + max(1, args.chunk_pages))
        target = output_dir / f"part-{start + 1:05d}-{end:05d}.pdf"
        writer = PdfWriter()
        for index in range(start, end):
            writer.add_page(reader.pages[index])
        with target.open("wb") as stream:
            writer.write(stream)
        chunks.append({"path": str(target), "startPage": start + 1, "endPage": end, "pageCount": end - start})
    (output_dir / "manifest.json").write_text(json.dumps({"pageCount": total, "chunkPages": args.chunk_pages, "chunks": chunks}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"pageCount": total, "chunkCount": len(chunks), "chunkPages": args.chunk_pages}, ensure_ascii=False))

if __name__ == "__main__":
    main()
