import json
import os
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET


P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"p": P, "a": A, "r": R, "rel": REL}


def number(node, name):
    try:
        return int(node.attrib.get(name, 0))
    except (TypeError, ValueError):
        return 0


def xfrm_box(node):
    if node is None:
        return []
    off = node.find("a:off", NS)
    ext = node.find("a:ext", NS)
    return [number(off, "x"), number(off, "y"), number(ext, "cx"), number(ext, "cy")] if off is not None and ext is not None else []


def slide_relations(archive, slide_name):
    directory, filename = posixpath.split(slide_name)
    rel_name = posixpath.join(directory, "_rels", f"{filename}.rels")
    if rel_name not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(rel_name))
    relations = {}
    for item in root.findall("rel:Relationship", NS):
        target = item.attrib.get("Target", "")
        if target and not target.startswith(("http://", "https://")):
            relations[item.attrib.get("Id", "")] = posixpath.normpath(posixpath.join(directory, target))
    return relations


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: knowledge-pptx-extract.py input.pptx output.json media_dir")
    source, output, media_dir = sys.argv[1:]
    os.makedirs(media_dir, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        slide_size = []
        if "ppt/presentation.xml" in archive.namelist():
            presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
            size = presentation.find("p:sldSz", NS)
            if size is not None:
                slide_size = [number(size, "cx"), number(size, "cy")]
        slide_names = sorted(
            (name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")),
            key=lambda name: int(posixpath.basename(name)[5:-4]),
        )
        slides = []
        for slide_name in slide_names:
            slide_number = int(posixpath.basename(slide_name)[5:-4])
            root = ET.fromstring(archive.read(slide_name))
            relations = slide_relations(archive, slide_name)
            texts = []
            for shape in root.findall(".//p:sp", NS):
                value = " ".join((node.text or "").strip() for node in shape.findall(".//a:t", NS) if (node.text or "").strip())
                if value:
                    texts.append(value)
            images = []
            for index, picture in enumerate(root.findall(".//p:pic", NS), 1):
                blip = picture.find(".//a:blip", NS)
                relation_id = blip.attrib.get(f"{{{R}}}embed", "") if blip is not None else ""
                member = relations.get(relation_id, "")
                if not member or member not in archive.namelist():
                    continue
                extension = posixpath.splitext(member)[1].lower() or ".bin"
                extracted_name = f"slide-{slide_number:04d}-image-{index:03d}{extension}"
                extracted_path = os.path.join(media_dir, extracted_name)
                with open(extracted_path, "wb") as target:
                    target.write(archive.read(member))
                name_node = picture.find("p:nvPicPr/p:cNvPr", NS)
                images.append({
                    "relationId": relation_id,
                    "name": name_node.attrib.get("name", "") if name_node is not None else "",
                    "mediaName": posixpath.basename(member),
                    "path": extracted_path,
                    "cropBox": xfrm_box(picture.find("p:spPr/a:xfrm", NS)),
                })
            slides.append({"slide": slide_number, "texts": texts, "images": images})
    with open(output, "w", encoding="utf-8") as target:
        json.dump({"schemaVersion": "qms-pptx-evidence-v1", "slideSize": slide_size, "slides": slides}, target, ensure_ascii=False)


if __name__ == "__main__":
    main()
