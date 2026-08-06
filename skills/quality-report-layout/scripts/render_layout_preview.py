"""Render a deterministic preview of the quality-report-layout visual system.

This preview is intentionally data-only: it demonstrates hierarchy, colors,
cards, chart and action-table proportions without inventing a project result.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


W, H = 1600, 1000
BG = "#F5F7FA"
INK = "#172B4D"
MUTED = "#6B7A90"
LINE = "#E5EAF0"
BLUE = "#3B82F6"
SKY = "#38BDF8"
PURPLE = "#8B5CF6"
RED = "#D92D20"
ORANGE = "#F79009"
YELLOW = "#FACC15"
GREEN = "#12B76A"


def font(size: int, bold: bool = False):
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
        r"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                pass
    return ImageFont.load_default()


def rounded(draw, box, fill, radius=16, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size=16, fill=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="report-layout-preview.png")
    args = parser.parse_args()

    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    # Header
    rounded(draw, (32, 28, W - 32, 152), "#FFFFFF", 20)
    draw.rectangle((32, 28, 42, 152), fill=RED)
    text(draw, (68, 57), "质量分析 Agent · 正式复盘报告", 30, INK, True)
    text(draw, (70, 102), "IPQC｜2026-01-01—2026-06-30｜公司级 / 基地 / 交付经理", 15, MUTED)
    rounded(draw, (1320, 60, 1530, 116), "#ECFDF3", 28)
    text(draw, (1425, 88), "可信度 A", 16, GREEN, True, "mm")

    # KPI cards
    cards = [
        ("异常密度", "4.73%", "同期 3.15%", RED),
        ("送检数量", "12,840", "同期 11,560", BLUE),
        ("重复问题", "18 项", "占重点问题 62%", ORANGE),
        ("关闭率", "86.4%", "目标 ≥ 90%", GREEN),
    ]
    x = 32
    for label, value, detail, accent in cards:
        rounded(draw, (x, 180, x + 366, 286), "#FFFFFF", 16, LINE)
        draw.ellipse((x + 22, 201, x + 36, 215), fill=accent)
        text(draw, (x + 50, 198), label, 14, MUTED)
        text(draw, (x + 22, 238), value, 28, INK, True)
        text(draw, (x + 182, 250), detail, 13, MUTED)
        x += 382

    # Left: risk cards
    rounded(draw, (32, 314, 650, 642), "#FFFFFF", 16, LINE)
    text(draw, (60, 348), "01 重点风险与二八集中度", 20, INK, True)
    text(draw, (60, 386), "重点问题集中在少数失效机制，优先处理红色主题。", 13, MUTED)
    risks = [
        (RED, "重复问题集中", "18 项 · 62%", "同类异常连续发生，需建立复发门禁"),
        (ORANGE, "加工件过程波动", "11 项 · 38%", "过程参数和首件确认仍需验证"),
        (YELLOW, "责任映射待核实", "4 项", "缺少完整的机长/交付经理映射证据"),
    ]
    y = 430
    for color, title, metric, detail in risks:
        draw.rectangle((60, y, 68, y + 68), fill=color)
        text(draw, (88, y + 2), title, 16, INK, True)
        text(draw, (88, y + 30), metric, 14, color, True)
        text(draw, (88, y + 53), detail, 12, MUTED)
        y += 78

    # Right: clustered ranking chart
    rounded(draw, (682, 314, 1568, 642), "#FFFFFF", 16, LINE)
    text(draw, (712, 348), "02 个人问题排名（簇状条形图）", 20, INK, True)
    text(draw, (712, 386), "红色五角星为当前当事人；同期值使用浅色条。", 13, MUTED)
    rows = [("★ 张三", 18, 11, RED), ("李四", 15, 12, SKY), ("王五", 12, 9, PURPLE), ("赵六", 8, 10, BLUE)]
    base_x, base_y, bar_w = 900, 438, 20
    for i, (name, current, prior, name_color) in enumerate(rows):
        yy = base_y + i * 44
        text(draw, (712, yy + 10), name, 14, name_color if name.startswith(("★", "李", "王")) else INK, name.startswith("★"))
        draw.rounded_rectangle((base_x, yy, base_x + current * bar_w, yy + 14), 7, fill=RED if name.startswith("★") else BLUE)
        draw.rounded_rectangle((base_x, yy + 19, base_x + prior * bar_w, yy + 31), 6, fill="#BBD7FF")
        text(draw, (base_x + max(current, prior) * bar_w + 12, yy - 2), f"{current} / {prior}", 12, MUTED)
    text(draw, (900, 608), "本期 / 同期", 12, MUTED)

    # Action table
    rounded(draw, (32, 670, 1568, 958), "#FFFFFF", 16, LINE)
    text(draw, (60, 704), "03 30/60/90 天改善行动台账", 20, INK, True)
    text(draw, (60, 742), "每项行动具备责任、交付物、指标和关闭条件。", 13, MUTED)
    cols = [(60, "行动"), (280, "责任对象"), (520, "期限"), (690, "核心交付物"), (1160, "验收指标"), (1430, "状态")]
    for px, label in cols:
        text(draw, (px, 786), label, 13, MUTED, True)
    draw.line((60, 812, 1540, 812), fill=LINE, width=2)
    actions = [
        ("IPQC-01 重复问题门禁", "交付经理", "30天", "建立复发异常清单与首件复核", "复发率下降 ≥ 30%", "进行中", RED),
        ("IPQC-02 参数验证", "机长", "60天", "完成关键参数窗口确认", "一次通过率 ≥ 98%", "待验证", ORANGE),
        ("IPQC-03 闭环复核", "供应链经理", "90天", "月度复盘与证据归档", "关闭率 ≥ 90%", "未开始", BLUE),
    ]
    y = 836
    for action, owner, deadline, deliverable, metric, status, color in actions:
        text(draw, (60, y), action, 13, INK, True)
        text(draw, (280, y), owner, 13, INK)
        text(draw, (520, y), deadline, 13, INK)
        text(draw, (690, y), deliverable, 13, INK)
        text(draw, (1160, y), metric, 13, INK)
        rounded(draw, (1430, y - 5, 1525, y + 23), color, 14)
        text(draw, (1477, y + 9), status, 11, "#FFFFFF", True, "mm")
        y += 42

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    print(output.resolve())


if __name__ == "__main__":
    main()
