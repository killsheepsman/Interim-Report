from pathlib import Path
import json
import pandas as pd

BASE = Path(r"C:\Users\77247\Desktop\半年报")
SOURCE = BASE / "半年报数据" / "1-8月数据" / "DOAM" / "query_result_2025-2026.csv"
OUT = BASE / "quality-analytics-web" / "public" / "doam-default.json"

USE_COLS = ["产品部", "客户", "设备类型", "TPM", "机台编号", "班次日期", "班次", "告警次数", "告警信息"]
RENAME = {
    "产品部": "product",
    "客户": "customer",
    "设备类型": "deviceType",
    "TPM": "tpm",
    "机台编号": "machine",
    "班次日期": "date",
    "班次": "shift",
    "告警次数": "alarmCount",
    "告警信息": "alarmInfo",
}

KEYWORDS = [
    ("真空/吸附", ["真空", "吸盘", "吸附", "负压"]),
    ("测试/NG", ["NG", "测试", "不良", "测量"]),
    ("通讯/扫码", ["通讯", "通信", "扫码", "扫描", "二维码", "条码", "ORA-", "MPE"]),
    ("取料/丢料", ["取料", "取放", "丢料", "掉料", "吸取", "上料", "下料"]),
    ("气缸/磁开关", ["气缸", "磁开关", "气阀", "电磁"]),
    ("传感器/遮挡", ["传感器", "感应", "遮挡", "光电"]),
    ("定位/视觉", ["定位", "视觉", "相机", "偏移", "对位"]),
    ("上传/图片", ["上传", "图片", "图像", "截图"]),
    ("驱动器/轴", ["驱动器", "伺服", "电机", "轴", "运动"]),
]

def category(value):
    text = str(value or "")
    for name, words in KEYWORDS:
        if any(word.lower() in text.lower() for word in words):
            return name
    return "其他"

header = Path(SOURCE).open("rb").readline().decode("gb18030").strip().split(",")
missing = [name for name in USE_COLS if name not in header]
if missing:
    raise SystemExit("缺少字段: " + "、".join(missing) + "；实际表头: " + "、".join(header))

df = pd.read_csv(SOURCE, encoding="gb18030", usecols=USE_COLS, low_memory=False)
df = df.rename(columns=RENAME)
date = pd.to_datetime(df["date"], errors="coerce")
alarm = pd.to_numeric(df["alarmCount"].astype(str).str.replace(",", "", regex=False), errors="coerce")
df["date_dt"] = date
df["alarm_num"] = alarm
df["year"] = date.dt.year
df["month"] = date.dt.month
df["category"] = df["alarmInfo"].map(category)

valid = df[df["date_dt"].notna() & df["machine"].astype(str).str.strip().ne("") & df["shift"].astype(str).str.strip().ne("")].copy()
valid["machine_key"] = valid["deviceType"].astype(str).str.strip() + "||" + valid["machine"].astype(str).str.strip()
units = valid.groupby(["date", "shift", "machine_key"], as_index=False).agg(
    tpm=("tpm", "first"),
    deviceType=("deviceType", "first"),
    product=("product", "first"),
    customer=("customer", "first"),
    year=("year", "first"),
    month=("month", "first"),
    alarmTotal=("alarm_num", "sum"),
)
units["alarmTotal"] = units["alarmTotal"].fillna(0)
category_groups = valid.groupby(["year", "tpm", "category", "deviceType"], as_index=False).agg(
    alarm_num=("alarm_num", "sum"),
    machines=("machine_key", lambda s: sorted(set(s.astype(str)))),
    dates=("date", lambda s: sorted(set(s.astype(str)))),
)
category_groups["alarm_num"] = category_groups["alarm_num"].fillna(0)

quality = {
    "rowCount": int(len(df)),
    "dateMin": date.min().strftime("%Y-%m-%d") if date.notna().any() else "",
    "dateMax": date.max().strftime("%Y-%m-%d") if date.notna().any() else "",
    "blankDate": int(date.isna().sum()),
    "blankMachine": int(df["machine"].astype(str).str.strip().eq("").sum()),
    "blankShift": int(df["shift"].astype(str).str.strip().eq("").sum()),
    "invalidAlarm": int(alarm.isna().sum()),
    "blankInfo": int(df["alarmInfo"].fillna("").astype(str).str.strip().eq("").sum()),
    "yearRows": {str(int(year)): int(count) for year, count in df.loc[date.notna(), "year"].value_counts().items()},
    "machineCount": int(valid["machine_key"].nunique()),
    "tpmCount": int(valid["tpm"].nunique()),
    "deviceTypeCount": int(valid["deviceType"].nunique()),
    "alarmTotal": float(alarm.fillna(0).sum()),
}

payload = {
    "schema": "doam-default-v1",
    "files": [SOURCE.name],
    "quality": quality,
    "units": [
        {"d": str(row.date), "s": str(row.shift), "m": str(row.machine_key), "t": str(row.tpm), "e": str(row.deviceType), "p": str(row.product), "k": str(row.customer), "y": int(row.year), "o": int(row.month), "a": float(row.alarmTotal)}
        for row in units.itertuples(index=False)
    ],
    "categories": [
        {"y": int(row.year), "t": str(row.tpm), "c": str(row.category), "e": str(row.deviceType), "a": float(row.alarm_num), "ms": list(row.machines), "ds": list(row.dates)}
        for row in category_groups.itertuples(index=False)
    ],
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
dist = BASE / "quality-analytics-web" / "dist" / "doam-default.json"
if dist.parent.exists():
    dist.write_text(OUT.read_text(encoding="utf-8"), encoding="utf-8")
print(json.dumps({"out": str(OUT), "units": len(payload["units"]), "categories": len(payload["categories"]), "bytes": OUT.stat().st_size, "usedColumns": USE_COLS, "ignoredColumns": [name for name in header if name not in USE_COLS], "quality": quality}, ensure_ascii=False, default=str))
