import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


source = Path(sys.argv[1])
target = Path(sys.argv[2])
extension = source.suffix.lower()
segments = []


def add(text, locator, **metadata):
    text = re.sub(r"[ \t]+", " ", str(text or "")).strip()
    if text:
        segments.append({"text": text, "metadata": {"locator": locator, **metadata}})


if extension == ".docx":
    with zipfile.ZipFile(source) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    for index, paragraph in enumerate(root.findall(".//w:p", ns), 1):
        add("".join(node.text or "" for node in paragraph.findall(".//w:t", ns)), f"段落 {index}", locatorType="paragraph", paragraph=index)
elif extension == ".xmind":
    with zipfile.ZipFile(source) as archive:
        names = set(archive.namelist())
        if "content.json" in names:
            payload = json.loads(archive.read("content.json").decode("utf-8"))

            def walk(topic, path=None):
                path = path or []
                if not isinstance(topic, dict):
                    return
                title = str(topic.get("title") or topic.get("topicTitle") or "").strip()
                current = path + ([title] if title else [])
                if title:
                    add(" / ".join(current), " / ".join(current), locatorType="xmind-node", nodePath=current)
                children = topic.get("children") or {}
                if isinstance(children, dict):
                    children = children.get("attached") or children.get("topics") or []
                for child in children if isinstance(children, list) else []:
                    walk(child, current)

            for sheet in payload if isinstance(payload, list) else payload.get("sheets", []):
                walk(sheet.get("rootTopic") or sheet.get("root") or sheet)
        elif "content.xml" in names:
            root = ET.fromstring(archive.read("content.xml"))
            for index, node in enumerate(root.iter(), 1):
                if node.tag.endswith("title"):
                    add("".join(node.itertext()), f"节点 {index}", locatorType="xmind-node")
elif extension in {".txt", ".md"}:
    text = source.read_text(encoding="utf-8-sig", errors="replace")
    for index, line in enumerate(text.splitlines(), 1):
        add(line, f"第 {index} 行", locatorType="text-line", line=index)
elif extension == ".doc":
    data = source.read_bytes()
    # Conservative fallback for legacy OLE Word: recover readable UTF-16LE
    # runs. Layout/tables remain marked for manual review.
    decoded = data.decode("utf-16le", errors="ignore")
    runs = re.findall(r"[\u3400-\u9fffA-Za-z0-9，。；：、（）()\-_/ ]{6,}", decoded)
    for index, value in enumerate(runs, 1):
        add(value, f"可读文本 {index}", locatorType="legacy-doc-text", extraction="utf16-run")
else:
    raise ValueError(f"unsupported extension: {extension}")

target.write_text(json.dumps({"segments": segments}, ensure_ascii=False), encoding="utf-8")
