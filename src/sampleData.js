export const sampleData = {
  period: "2026年上半年",
  updatedAt: "2026-06-21 21:30",
  kpis: [
    { key: "iqc", label: "IQC 批次良率", value: 93.5, unit: "%", delta: -1.3, goodWhenDown: false, detail: "供应商加工件 · 深杭合计" },
    { key: "ipqc", label: "IPQC 异常密度", value: 7.0, unit: "%", delta: -5.1, goodWhenDown: true, detail: "问题数量 ÷ 送检数" },
    { key: "oqc", label: "OQC 5分率", value: 67.1, unit: "%", delta: 32.5, goodWhenDown: false, detail: "2026年1—5月" },
    { key: "dqa", label: "DQA 后端问题", value: 3760, unit: "项", delta: 42.4, goodWhenDown: true, detail: "生产 + 现场问题" },
  ],
  iqc: {
    monthly: {
      labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
      series: [
        { name: "2025", data: [95.1, 95.5, 94.8, 95.6, 94.6, 94.2] },
        { name: "2026", data: [94.0, 93.7, 94.2, 93.6, 93.1, 92.7] },
      ],
    },
    suppliers: [
      { supplier: "兴日鑫", site: "深圳", type: "铝件", y2025: 97.8, y2026: 98.5, batches: 1833, risk: "低", issue: "尺寸/公差" },
      { supplier: "奋为", site: "深圳", type: "针模", y2025: 98.4, y2026: 96.7, batches: 810, risk: "低", issue: "孔位/孔径" },
      { supplier: "晟鑫", site: "深圳", type: "非金属", y2025: 95.1, y2026: 93.9, batches: 1849, risk: "中", issue: "尺寸/公差" },
      { supplier: "睿辉", site: "杭州", type: "针模", y2025: 97.0, y2026: 91.1, batches: 994, risk: "高", issue: "尺寸/公差" },
      { supplier: "品盈", site: "杭州", type: "铝件", y2025: 97.7, y2026: 93.6, batches: 2760, risk: "中", issue: "尺寸/螺纹" },
      { supplier: "海易鸿", site: "深圳", type: "铜块", y2025: 95.0, y2026: 83.6, batches: 427, risk: "高", issue: "尺寸/毛刺" },
      { supplier: "金盛金属", site: "深圳", type: "大板", y2025: 66.0, y2026: 81.2, batches: 16, risk: "高", issue: "尺寸/公差" },
    ],
    material: [
      { name: "车床件", value: 95.5 }, { name: "铝件", value: 95.4 }, { name: "PEEK针模", value: 95.4 },
      { name: "钣金", value: 94.8 }, { name: "非金属", value: 93.4 }, { name: "钢件", value: 92.3 },
      { name: "PAI针模", value: 90.7 }, { name: "铜", value: 82.8 },
    ],
    siteMonthly: {
      深圳: [
        { month: "1月", y2025Qty: 18240, y2026Qty: 16580, y2025Rate: 95.4, y2026Rate: 94.5 },
        { month: "2月", y2025Qty: 16880, y2026Qty: 15120, y2025Rate: 95.7, y2026Rate: 94.2 },
        { month: "3月", y2025Qty: 19350, y2026Qty: 17660, y2025Rate: 95.1, y2026Rate: 94.7 },
        { month: "4月", y2025Qty: 20210, y2026Qty: 18140, y2025Rate: 95.8, y2026Rate: 94.1 },
        { month: "5月", y2025Qty: 19680, y2026Qty: 17490, y2025Rate: 94.9, y2026Rate: 93.7 },
        { month: "6月", y2025Qty: 18720, y2026Qty: 13880, y2025Rate: 94.6, y2026Rate: 93.2 },
      ],
      杭州: [
        { month: "1月", y2025Qty: 17120, y2026Qty: 16020, y2025Rate: 94.3, y2026Rate: 92.1 },
        { month: "2月", y2025Qty: 15840, y2026Qty: 14920, y2025Rate: 94.7, y2026Rate: 92.5 },
        { month: "3月", y2025Qty: 18160, y2026Qty: 16980, y2025Rate: 93.9, y2026Rate: 91.8 },
        { month: "4月", y2025Qty: 19220, y2026Qty: 17450, y2025Rate: 94.4, y2026Rate: 91.3 },
        { month: "5月", y2025Qty: 18560, y2026Qty: 16880, y2025Rate: 93.8, y2026Rate: 90.8 },
        { month: "6月", y2025Qty: 17630, y2026Qty: 14220, y2025Rate: 93.2, y2026Rate: 90.4 },
      ],
    },
    issueBySite: {
      深圳: [
        { name: "尺寸/公差", y2025Count: 612, y2026Count: 721, y2025Share: 42.8, y2026Share: 46.2 }, { name: "毛刺/锐边", y2025Count: 201, y2026Count: 180, y2025Share: 14.1, y2026Share: 11.5 },
        { name: "外观/损伤", y2025Count: 150, y2026Count: 142, y2025Share: 10.5, y2026Share: 9.1 }, { name: "孔位/孔径", y2025Count: 104, y2026Count: 118, y2025Share: 7.3, y2026Share: 7.6 },
        { name: "漏加工/错加工", y2025Count: 88, y2026Count: 95, y2025Share: 6.2, y2026Share: 6.1 }, { name: "螺纹/牙", y2025Count: 83, y2026Count: 76, y2025Share: 5.8, y2026Share: 4.9 },
        { name: "表面处理", y2025Count: 69, y2026Count: 63, y2025Share: 4.8, y2026Share: 4.0 }, { name: "其他", y2025Count: 122, y2026Count: 166, y2025Share: 8.5, y2026Share: 10.6 },
      ],
      杭州: [
        { name: "尺寸/公差", y2025Count: 1080, y2026Count: 1264, y2025Share: 47.2, y2026Share: 51.8 }, { name: "螺纹/牙", y2025Count: 278, y2026Count: 246, y2025Share: 12.1, y2026Share: 10.1 },
        { name: "标识/图纸", y2025Count: 186, y2026Count: 201, y2025Share: 8.1, y2026Share: 8.2 }, { name: "外观/损伤", y2025Count: 175, y2026Count: 168, y2025Share: 7.7, y2026Share: 6.9 },
        { name: "毛刺/锐边", y2025Count: 151, y2026Count: 142, y2025Share: 6.6, y2026Share: 5.8 }, { name: "孔位/孔径", y2025Count: 101, y2026Count: 108, y2025Share: 4.4, y2026Share: 4.4 },
        { name: "表面处理", y2025Count: 98, y2026Count: 91, y2025Share: 4.3, y2026Share: 3.7 }, { name: "其他", y2025Count: 220, y2026Count: 222, y2025Share: 9.6, y2026Share: 9.1 },
      ],
    },
    materialBySite: {
      深圳: [
        { name: "铝件", y2025Qty: 7810, y2026Qty: 7260, y2025Rate: 96.7, y2026Rate: 95.4 }, { name: "非金属", y2025Qty: 4350, y2026Qty: 4706, y2025Rate: 94.8, y2026Rate: 93.4 },
        { name: "钣金", y2025Qty: 3410, y2026Qty: 3250, y2025Rate: 95.6, y2026Rate: 94.8 }, { name: "钢件", y2025Qty: 2540, y2026Qty: 2764, y2025Rate: 93.8, y2026Rate: 92.3 },
        { name: "PEEK针模", y2025Qty: 680, y2026Qty: 735, y2025Rate: 96.1, y2026Rate: 95.4 }, { name: "铜", y2025Qty: 330, y2026Qty: 551, y2025Rate: 91.6, y2026Rate: 82.8 },
        { name: "车床件", y2025Qty: 310, y2026Qty: 353, y2025Rate: 94.9, y2026Rate: 95.5 }, { name: "PAI针模", y2025Qty: 275, y2026Qty: 301, y2025Rate: 92.4, y2026Rate: 90.7 },
      ],
      杭州: [
        { name: "铝件", y2025Qty: 11820, y2026Qty: 11015, y2025Rate: 94.9, y2026Rate: 90.2 }, { name: "钢件", y2025Qty: 4620, y2026Qty: 4861, y2025Rate: 92.7, y2026Rate: 90.8 },
        { name: "钣金", y2025Qty: 3540, y2026Qty: 3827, y2025Rate: 95.8, y2026Rate: 96.5 }, { name: "非金属", y2025Qty: 3980, y2026Qty: 3707, y2025Rate: 93.7, y2026Rate: 92.0 },
        { name: "PEEK针模", y2025Qty: 1170, y2026Qty: 1044, y2025Rate: 95.2, y2026Rate: 93.1 }, { name: "车床件", y2025Qty: 420, y2026Qty: 391, y2025Rate: 94.8, y2026Rate: 95.9 },
        { name: "PAI针模", y2025Qty: 330, y2026Qty: 294, y2025Rate: 89.7, y2026Rate: 81.6 }, { name: "铜", y2025Qty: 245, y2026Qty: 270, y2025Rate: 88.9, y2026Rate: 82.6 },
      ],
    },
    mainSuppliers: {
      深圳: [
        { supplier: "金盛金属", type: "大板", y2025Qty: 47, y2025Bad: 16, y2025Rate: 66.0, y2026Qty: 16, y2026Bad: 3, y2026Rate: 81.2 },
        { supplier: "海易鸿", type: "铜块", y2025Qty: 202, y2025Bad: 10, y2025Rate: 95.0, y2026Qty: 427, y2026Bad: 70, y2026Rate: 83.6 },
        { supplier: "睿辉", type: "针模", y2025Qty: 168, y2025Bad: 9, y2025Rate: 94.6, y2026Qty: 385, y2026Bad: 28, y2026Rate: 92.7 },
        { supplier: "鑫科拓威", type: "非金属", y2025Qty: 1550, y2025Bad: 113, y2025Rate: 92.7, y2026Qty: 1466, y2026Bad: 118, y2026Rate: 92.0 },
        { supplier: "晟鑫", type: "非金属", y2025Qty: 1127, y2025Bad: 55, y2025Rate: 95.1, y2026Qty: 1849, y2026Bad: 112, y2026Rate: 93.9 },
        { supplier: "明安信（三乐）", type: "铝件", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 0, y2026Bad: 0, y2026Rate: 0 },
        { supplier: "兴日鑫", type: "铝件", y2025Qty: 1940, y2025Bad: 43, y2025Rate: 97.8, y2026Qty: 1833, y2026Bad: 28, y2026Rate: 98.5 },
        { supplier: "奋为", type: "针模", y2025Qty: 635, y2025Bad: 10, y2025Rate: 98.4, y2026Qty: 810, y2026Bad: 27, y2026Rate: 96.7 },
        { supplier: "铭耀（钣金）", type: "钣金", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 0, y2026Bad: 0, y2026Rate: 0 },
      ],
      杭州: [
        { supplier: "多加", type: "钣金", y2025Qty: 1820, y2025Bad: 54, y2025Rate: 97.0, y2026Qty: 1690, y2026Bad: 61, y2026Rate: 96.4 },
        { supplier: "鑫科拓威", type: "铝件非金属", y2025Qty: 3683, y2025Bad: 275, y2025Rate: 92.5, y2026Qty: 2818, y2026Bad: 229, y2026Rate: 91.9 },
        { supplier: "品盈", type: "铝件", y2025Qty: 2894, y2025Bad: 66, y2025Rate: 97.7, y2026Qty: 2760, y2026Bad: 177, y2026Rate: 93.6 },
        { supplier: "棋康", type: "车床件", y2025Qty: 217, y2025Bad: 7, y2025Rate: 96.8, y2026Qty: 102, y2026Bad: 1, y2026Rate: 99.0 },
        { supplier: "睿辉", type: "针模", y2025Qty: 1370, y2025Bad: 41, y2025Rate: 97.0, y2026Qty: 994, y2026Bad: 88, y2026Rate: 91.1 },
        { supplier: "新翼", type: "小钣金", y2025Qty: 420, y2025Bad: 15, y2025Rate: 96.4, y2026Qty: 388, y2026Bad: 18, y2026Rate: 95.4 },
        { supplier: "博之旭（昆山）", type: "铝件", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 0, y2026Bad: 0, y2026Rate: 0 },
        { supplier: "昶晟", type: "钣金、机柜", y2025Qty: 750, y2025Bad: 24, y2025Rate: 96.8, y2026Qty: 680, y2026Bad: 29, y2026Rate: 95.7 },
        { supplier: "鸿潞", type: "车床件", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 3, y2026Bad: 0, y2026Rate: 100.0 },
        { supplier: "优之达（原新达NT）", type: "钢件", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 0, y2026Bad: 0, y2026Rate: 0 },
        { supplier: "锌傲翔", type: "大板", y2025Qty: 260, y2025Bad: 18, y2025Rate: 93.1, y2026Qty: 231, y2026Bad: 21, y2026Rate: 90.9 },
        { supplier: "上龛（苏州）", type: "铝件", y2025Qty: 0, y2025Bad: 0, y2025Rate: 0, y2026Qty: 0, y2026Bad: 0, y2026Rate: 0 },
      ],
    },
    supplierCandidates: {
      深圳: [
        { supplier: "华宇新", type: "铝件", y2025Qty: 2480, y2025Bad: 61, y2025Rate: 97.5, y2026Qty: 2691, y2026Bad: 74, y2026Rate: 97.3 },
        { supplier: "中鹏", type: "钢件", y2025Qty: 2186, y2025Bad: 72, y2025Rate: 96.7, y2026Qty: 2088, y2026Bad: 83, y2026Rate: 96.0 },
        { supplier: "新安昇", type: "铝件", y2025Qty: 1304, y2025Bad: 38, y2025Rate: 97.1, y2026Qty: 1501, y2026Bad: 52, y2026Rate: 96.5 },
        { supplier: "棋康", type: "钢件", y2025Qty: 1190, y2025Bad: 42, y2025Rate: 96.5, y2026Qty: 1094, y2026Bad: 39, y2026Rate: 96.4 },
        { supplier: "盛樾（东莞）", type: "铝件", y2025Qty: 602, y2025Bad: 21, y2025Rate: 96.5, y2026Qty: 627, y2026Bad: 26, y2026Rate: 95.9 },
      ],
      杭州: [
        { supplier: "匡超精密（昆山）", type: "铝件", y2025Qty: 1538, y2025Bad: 49, y2025Rate: 96.8, y2026Qty: 1543, y2026Bad: 62, y2026Rate: 96.0 },
        { supplier: "佳内德（KS）", type: "钢件", y2025Qty: 1420, y2025Bad: 53, y2025Rate: 96.3, y2026Qty: 1618, y2026Bad: 68, y2026Rate: 95.8 },
        { supplier: "固耐特", type: "其他", y2025Qty: 791, y2025Bad: 27, y2025Rate: 96.6, y2026Qty: 860, y2026Bad: 35, y2026Rate: 95.9 },
        { supplier: "昆奥森（苏州）", type: "铝件", y2025Qty: 664, y2025Bad: 18, y2025Rate: 97.3, y2026Qty: 736, y2026Bad: 29, y2026Rate: 96.1 },
        { supplier: "润翔", type: "钢件", y2025Qty: 621, y2025Bad: 25, y2025Rate: 96.0, y2026Qty: 748, y2026Bad: 34, y2026Rate: 95.5 },
      ],
    },
  },
  ipqc: {
    workshops: [
      { name: "深圳二工坊(外包)", y2025: 68.1, y2026: 82.7, issues: 411 },
      { name: "杭州一工坊(外包)", y2025: 61.3, y2026: 72.7, issues: 178 },
      { name: "杭州二工坊(外包)", y2025: 34.8, y2026: 29.7, issues: 310 },
      { name: "深圳五工坊(外包)", y2025: 31.1, y2026: 25.4, issues: 328 },
      { name: "深圳一工坊", y2025: 12.5, y2026: 8.2, issues: 402 },
      { name: "杭州二工坊", y2025: 10.7, y2026: 6.6, issues: 369 },
    ],
    categories: [
      { name: "螺丝/紧固", shenzhen: 18.4, hangzhou: 15.3 },
      { name: "接线/线缆", shenzhen: 11.4, hangzhou: 13.8 },
      { name: "漏装/错装/反装", shenzhen: 9.9, hangzhou: 9.6 },
      { name: "研发设计/资料", shenzhen: 7.2, hangzhou: 3.5 },
      { name: "结构干涉/空间", shenzhen: 3.8, hangzhou: 7.8 },
      { name: "气路/管路", shenzhen: 3.2, hangzhou: 4.9 },
      { name: "线束整理/绝缘", shenzhen: 3.0, hangzhou: 6.9 },
    ],
    siteMonthly: {
      深圳: [
        { month:"1月",y2025Qty:6200,y2025Bad:510,y2025Rate:8.2,y2026Qty:5740,y2026Bad:401,y2026Rate:7.0 },{ month:"2月",y2025Qty:5450,y2025Bad:438,y2025Rate:8.0,y2026Qty:4980,y2026Bad:317,y2026Rate:6.4 },
        { month:"3月",y2025Qty:6410,y2025Bad:521,y2025Rate:8.1,y2026Qty:5960,y2026Bad:396,y2026Rate:6.6 },{ month:"4月",y2025Qty:6010,y2025Bad:472,y2025Rate:7.9,y2026Qty:5520,y2026Bad:354,y2026Rate:6.4 },
        { month:"5月",y2025Qty:5790,y2025Bad:445,y2025Rate:7.7,y2026Qty:5290,y2026Bad:321,y2026Rate:6.1 },{ month:"6月",y2025Qty:5480,y2025Bad:416,y2025Rate:7.6,y2026Qty:5008,y2026Bad:298,y2026Rate:6.0 },
      ],
      杭州: [
        { month:"1月",y2025Qty:5660,y2025Bad:552,y2025Rate:9.8,y2026Qty:5180,y2026Bad:471,y2026Rate:9.1 },{ month:"2月",y2025Qty:5010,y2025Bad:471,y2025Rate:9.4,y2026Qty:4630,y2026Bad:390,y2026Rate:8.4 },
        { month:"3月",y2025Qty:5880,y2025Bad:548,y2025Rate:9.3,y2026Qty:5420,y2026Bad:459,y2026Rate:8.5 },{ month:"4月",y2025Qty:5570,y2025Bad:501,y2025Rate:9.0,y2026Qty:5140,y2026Bad:417,y2026Rate:8.1 },
        { month:"5月",y2025Qty:5360,y2025Bad:469,y2025Rate:8.8,y2026Qty:4930,y2026Bad:386,y2026Rate:7.8 },{ month:"6月",y2025Qty:5070,y2025Bad:431,y2025Rate:8.5,y2026Qty:4637,y2026Bad:354,y2026Rate:7.6 },
      ],
    },
    workshopsBySite: {
      深圳: [
        {name:"五工坊",y2025Qty:10620,y2025Bad:812,y2025Rate:7.6,y2026Qty:9840,y2026Bad:636,y2026Rate:6.5},{name:"二工坊",y2025Qty:8510,y2025Bad:681,y2025Rate:8.0,y2026Qty:7920,y2026Bad:502,y2026Rate:6.3},
        {name:"平台",y2025Qty:7890,y2025Bad:548,y2025Rate:6.9,y2026Qty:7210,y2026Bad:421,y2026Rate:5.8},{name:"一工坊",y2025Qty:4960,y2025Bad:388,y2025Rate:7.8,y2026Qty:4520,y2026Bad:285,y2026Rate:6.3},
        {name:"五工坊(外包)",y2025Qty:1890,y2025Bad:494,y2025Rate:26.1,y2026Qty:1630,y2026Bad:414,y2026Rate:25.4},{name:"二工坊(外包)",y2025Qty:1470,y2025Bad:455,y2025Rate:31.0,y2026Qty:1378,y2026Bad:410,y2026Rate:29.8},
      ],
      杭州: [
        {name:"二工坊",y2025Qty:10230,y2025Bad:1051,y2025Rate:10.3,y2026Qty:9510,y2026Bad:628,y2026Rate:6.6},{name:"四工坊",y2025Qty:8140,y2025Bad:694,y2025Rate:8.5,y2026Qty:7630,y2026Bad:568,y2026Rate:7.4},
        {name:"一工坊",y2025Qty:6580,y2025Bad:551,y2025Rate:8.4,y2026Qty:6040,y2026Bad:442,y2026Rate:7.3},{name:"三工坊",y2025Qty:5690,y2025Bad:490,y2025Rate:8.6,y2026Qty:5230,y2026Bad:405,y2026Rate:7.7},
        {name:"二工坊（外包）",y2025Qty:1120,y2025Bad:390,y2025Rate:34.8,y2026Qty:1044,y2026Bad:310,y2026Rate:29.7},{name:"一工坊（外包）",y2025Qty:330,y2025Bad:202,y2025Rate:61.2,y2026Qty:245,y2026Bad:178,y2026Rate:72.7},
      ],
    },
    rawTypesBySite: {
      深圳: [
        {name:"装配问题",y2025Count:884,y2026Count:748,y2025Share:32.7,y2026Share:33.1},{name:"接线问题",y2025Count:521,y2026Count:418,y2025Share:19.3,y2026Share:18.5},{name:"研发问题",y2025Count:306,y2026Count:248,y2025Share:11.3,y2026Share:11.0},{name:"螺丝问题",y2025Count:301,y2026Count:245,y2025Share:11.1,y2026Share:10.8},{name:"来料问题",y2025Count:242,y2026Count:213,y2025Share:9.0,y2026Share:9.4},{name:"设计问题",y2025Count:126,y2026Count:114,y2025Share:4.7,y2026Share:5.0},
      ],
      杭州: [
        {name:"接线问题",y2025Count:1298,y2026Count:1124,y2025Share:42.1,y2026Share:38.9},{name:"装配问题",y2025Count:805,y2026Count:757,y2025Share:26.1,y2026Share:26.2},{name:"螺丝问题",y2025Count:388,y2026Count:348,y2025Share:12.6,y2026Share:12.0},{name:"来料问题",y2025Count:218,y2026Count:188,y2025Share:7.1,y2026Share:6.5},{name:"设计问题",y2025Count:151,y2026Count:141,y2025Share:4.9,y2026Share:4.9},{name:"研发问题",y2025Count:103,y2026Count:94,y2025Share:3.3,y2026Share:3.3},
      ],
    },
    contentTypesBySite: {
      深圳: [
        {name:"螺丝/紧固",y2025Count:720,y2026Count:610,y2025Share:26.6,y2026Share:27.0},{name:"接线/线缆",y2025Count:535,y2026Count:450,y2025Share:19.8,y2026Share:19.9},{name:"漏装/错装/反装",y2025Count:426,y2026Count:378,y2025Share:15.7,y2026Share:16.7},{name:"研发设计/资料",y2025Count:348,y2026Count:285,y2025Share:12.9,y2026Share:12.6},{name:"结构干涉/空间",y2025Count:222,y2026Count:201,y2025Share:8.2,y2026Share:8.9},{name:"气路/管路",y2025Count:176,y2026Count:149,y2025Share:6.5,y2026Share:6.6},
      ],
      杭州: [
        {name:"接线/线缆",y2025Count:1260,y2026Count:1102,y2025Share:40.9,y2026Share:38.1},{name:"螺丝/紧固",y2025Count:590,y2026Count:548,y2025Share:19.1,y2026Share:19.0},{name:"漏装/错装/反装",y2025Count:455,y2026Count:430,y2025Share:14.8,y2026Share:14.9},{name:"结构干涉/空间",y2025Count:280,y2026Count:267,y2025Share:9.1,y2026Share:9.2},{name:"研发设计/资料",y2025Count:245,y2026Count:229,y2025Share:8.0,y2026Share:7.9},{name:"气路/管路",y2025Count:151,y2026Count:143,y2025Share:4.9,y2026Share:4.9},
      ],
    },
    heatmapBySite: {
      深圳: {categories:["螺丝/紧固","接线/线缆","漏装/错装/反装","研发设计/资料","结构干涉/空间","气路/管路"],rows:[{name:"五工坊",values:[188,152,136,82,54,38]},{name:"二工坊",values:[142,116,95,61,43,31]},{name:"平台",values:[65,48,32,84,26,11]},{name:"一工坊",values:[79,55,62,28,31,24]},{name:"五工坊(外包)",values:[83,51,39,18,28,22]},{name:"二工坊(外包)",values:[53,28,14,12,19,23]}]},
      杭州: {categories:["接线/线缆","螺丝/紧固","漏装/错装/反装","结构干涉/空间","研发设计/资料","气路/管路"],rows:[{name:"二工坊",values:[301,132,101,57,49,31]},{name:"四工坊",values:[246,116,88,49,43,27]},{name:"一工坊",values:[198,91,76,42,35,21]},{name:"三工坊",values:[162,82,69,46,31,22]},{name:"二工坊（外包）",values:[106,58,45,38,29,25]},{name:"一工坊（外包）",values:[87,42,31,35,28,17]}]},
    },
    improvementsBySite: {
      深圳: [
        {rank:1,category:"螺丝/紧固",count:610,share:27.0,delta:-110,workshop:"五工坊",owner:"生产工艺/IPQC",action:"建立扭矩标准、关键螺丝点检清单和防松标识；首件及巡检复核扭矩。"},
        {rank:2,category:"接线/线缆",count:450,share:19.9,delta:-85,workshop:"五工坊",owner:"电气装配/工艺",action:"发布端子与线序图册，实施首件接线互检、拉力抽检和通电前点对点检查。"},
        {rank:3,category:"漏装/错装/反装",count:378,share:16.7,delta:-48,workshop:"五工坊",owner:"工坊主管/IPQC",action:"增加齐套清单、工位防错照片和完工自检签字；高频物料导入扫码防错。"},
      ],
      杭州: [
        {rank:1,category:"接线/线缆",count:1102,share:38.1,delta:-158,workshop:"二工坊",owner:"电气装配/工艺",action:"发布端子与线序图册，实施首件接线互检、拉力抽检和通电前点对点检查。"},
        {rank:2,category:"螺丝/紧固",count:548,share:19.0,delta:-42,workshop:"二工坊",owner:"生产工艺/IPQC",action:"建立扭矩标准、关键螺丝点检清单和防松标识；首件及巡检复核扭矩。"},
        {rank:3,category:"漏装/错装/反装",count:430,share:14.9,delta:-25,workshop:"二工坊",owner:"工坊主管/IPQC",action:"增加齐套清单、工位防错照片和完工自检签字；高频物料导入扫码防错。"},
      ],
    },
  },
  oqc: {
    monthlySummary: {
      divisions: [
        {name:"产品一部",y2025Count:268,y2025ScoreTotal:1227,y2025Avg:4.58,y2025FiveRate:59,y2025LowRate:1.1,y2026Count:105,y2026ScoreTotal:512,y2026Avg:4.88,y2026FiveRate:88.6,y2026LowRate:1},
        {name:"产品五部",y2025Count:379,y2025ScoreTotal:1627,y2025Avg:4.29,y2025FiveRate:39.1,y2025LowRate:9.2,y2026Count:390,y2026ScoreTotal:1786,y2026Avg:4.58,y2026FiveRate:66.7,y2026LowRate:7.2},
        {name:"FPC事业部",y2025Count:588,y2025ScoreTotal:2385,y2025Avg:4.06,y2025FiveRate:27.7,y2025LowRate:18.4,y2026Count:404,y2026ScoreTotal:1822,y2026Avg:4.51,y2026FiveRate:61.9,y2026LowRate:9.7},
      ],
      fpcTpm: [
        {name:"刘波",y2025Count:41,y2025Avg:3.93,y2025FiveRate:12.2,y2025LowRate:12.2,y2026Count:49,y2026Avg:4.39,y2026FiveRate:46.9,y2026LowRate:8.2},
        {name:"王辉",y2025Count:202,y2025Avg:4.41,y2025FiveRate:49.5,y2025LowRate:7.9,y2026Count:113,y2026Avg:4.42,y2026FiveRate:55.8,y2026LowRate:9.7},
        {name:"罗超",y2025Count:113,y2025Avg:3.76,y2025FiveRate:22.1,y2025LowRate:33.6,y2026Count:62,y2026Avg:4.32,y2026FiveRate:48.4,y2026LowRate:14.5},
        {name:"林秋秋",y2025Count:80,y2025Avg:3.9,y2025FiveRate:16.3,y2025LowRate:23.8,y2026Count:33,y2026Avg:3.79,y2026FiveRate:15.2,y2026LowRate:36.4},
        {name:"朱慧慧",y2025Count:152,y2025Avg:3.93,y2025FiveRate:13.2,y2025LowRate:19.7,y2026Count:147,y2026Avg:4.86,y2026FiveRate:87.8,y2026LowRate:2},
      ],
      divisionMonthly: {
        产品一部: [
          {month:"1月",y2025Count:44,y2025Avg:4.84,y2025FiveRate:86.4,y2025LowRate:2.3,y2026Count:9,y2026Avg:5,y2026FiveRate:100,y2026LowRate:0},
          {month:"2月",y2025Count:40,y2025Avg:4.53,y2025FiveRate:57.5,y2025LowRate:5,y2026Count:3,y2026Avg:4,y2026FiveRate:33.3,y2026LowRate:33.3},
          {month:"3月",y2025Count:86,y2025Avg:5,y2025FiveRate:100,y2025LowRate:0,y2026Count:46,y2026Avg:4.85,y2026FiveRate:84.8,y2026LowRate:0},
          {month:"4月",y2025Count:23,y2025Avg:4.17,y2025FiveRate:17.4,y2025LowRate:0,y2026Count:4,y2026Avg:4.25,y2026FiveRate:25,y2026LowRate:0},
          {month:"5月",y2025Count:75,y2025Avg:4.09,y2025FiveRate:9.3,y2025LowRate:0,y2026Count:43,y2026Avg:5,y2026FiveRate:100,y2026LowRate:0},
        ],
        产品五部: [
          {month:"1月",y2025Count:35,y2025Avg:4.09,y2025FiveRate:37.1,y2025LowRate:28.6,y2026Count:39,y2026Avg:4.33,y2026FiveRate:43.6,y2026LowRate:10.3},
          {month:"2月",y2025Count:46,y2025Avg:3.78,y2025FiveRate:2.2,y2025LowRate:19.6,y2026Count:28,y2026Avg:4.54,y2026FiveRate:57.1,y2026LowRate:3.6},
          {month:"3月",y2025Count:78,y2025Avg:4.05,y2025FiveRate:16.7,y2025LowRate:11.5,y2026Count:89,y2026Avg:4.48,y2026FiveRate:53.9,y2026LowRate:5.6},
          {month:"4月",y2025Count:130,y2025Avg:4.42,y2025FiveRate:44.6,y2025LowRate:2.3,y2026Count:188,y2026Avg:4.66,y2026FiveRate:77.7,y2026LowRate:8.5},
          {month:"5月",y2025Count:90,y2025Avg:4.66,y2025FiveRate:70,y2025LowRate:4.4,y2026Count:46,y2026Avg:4.65,y2026FiveRate:71.7,y2026LowRate:4.3},
        ],
        FPC事业部: [
          {month:"1月",y2025Count:38,y2025Avg:4.37,y2025FiveRate:47.4,y2025LowRate:10.5,y2026Count:50,y2026Avg:4.24,y2026FiveRate:46,y2026LowRate:16},
          {month:"2月",y2025Count:62,y2025Avg:4.03,y2025FiveRate:30.6,y2025LowRate:24.2,y2026Count:40,y2026Avg:4.38,y2026FiveRate:55,y2026LowRate:12.5},
          {month:"3月",y2025Count:121,y2025Avg:3.94,y2025FiveRate:22.3,y2025LowRate:21.5,y2026Count:66,y2026Avg:4.48,y2026FiveRate:54.5,y2026LowRate:6.1},
          {month:"4月",y2025Count:205,y2025Avg:3.95,y2025FiveRate:18,y2025LowRate:20,y2026Count:160,y2026Avg:4.58,y2026FiveRate:71.3,y2026LowRate:13.1},
          {month:"5月",y2025Count:162,y2025Avg:4.22,y2025FiveRate:38.3,y2025LowRate:13.6,y2026Count:88,y2026Avg:4.61,y2026FiveRate:62.5,y2026LowRate:1.1},
        ],
      },
      fpcMonthly: [
        {month:"1月",y2025Count:38,y2025Avg:4.37,y2025FiveRate:47.4,y2025LowRate:10.5,y2026Count:50,y2026Avg:4.24,y2026FiveRate:46,y2026LowRate:16},
        {month:"2月",y2025Count:62,y2025Avg:4.03,y2025FiveRate:30.6,y2025LowRate:24.2,y2026Count:40,y2026Avg:4.38,y2026FiveRate:55,y2026LowRate:12.5},
        {month:"3月",y2025Count:121,y2025Avg:3.94,y2025FiveRate:22.3,y2025LowRate:21.5,y2026Count:66,y2026Avg:4.48,y2026FiveRate:54.5,y2026LowRate:6.1},
        {month:"4月",y2025Count:205,y2025Avg:3.95,y2025FiveRate:18,y2025LowRate:20,y2026Count:160,y2026Avg:4.58,y2026FiveRate:71.3,y2026LowRate:13.1},
        {month:"5月",y2025Count:162,y2025Avg:4.22,y2025FiveRate:38.3,y2025LowRate:13.6,y2026Count:88,y2026Avg:4.61,y2026FiveRate:62.5,y2026LowRate:1.1},
      ],
    },
    tpm: [
      { name: "赵佳池", devices: 105, avg: 4.88, fiveRate: 88.6, lowRate: 1.0 },
      { name: "朱慧慧", devices: 147, avg: 4.86, fiveRate: 87.8, lowRate: 2.0 },
      { name: "郑昊翔", devices: 249, avg: 4.66, fiveRate: 69.9, lowRate: 4.0 },
      { name: "周超", devices: 28, avg: 4.68, fiveRate: 67.9, lowRate: 0.0 },
      { name: "谢作林", devices: 113, avg: 4.38, fiveRate: 59.3, lowRate: 15.9 },
      { name: "王辉", devices: 113, avg: 4.42, fiveRate: 55.8, lowRate: 9.7 },
      { name: "罗超", devices: 62, avg: 4.32, fiveRate: 48.4, lowRate: 14.5 },
      { name: "刘波", devices: 49, avg: 4.39, fiveRate: 46.9, lowRate: 8.2 },
      { name: "林秋秋", devices: 33, avg: 3.79, fiveRate: 15.2, lowRate: 36.4 },
    ],
    onsite: [
      { name: "功能/测试/稳定性", count: 154, share: 28.3 },
      { name: "针模/探针/排线", count: 47, share: 8.6 },
      { name: "机械结构/干涉", count: 45, share: 8.3 },
      { name: "电气接线/元件", count: 36, share: 6.6 },
      { name: "装配/紧固/漏装", count: 36, share: 6.6 },
      { name: "卡料/上下料", count: 33, share: 6.1 },
      { name: "软件/程序/通讯", count: 20, share: 3.7 },
    ],
  },
  dqa: {
    divisions: [
      { name: "半导体&北美", review: 148, production: 254, onsite: 126 },
      { name: "产品五部", review: 266, production: 490, onsite: 663 },
      { name: "FPC事业部", review: 654, production: 1080, onsite: 1147 },
    ],
    tpmStages: [
      { name: "郑昊翔", division: "产品五部", review: 132, production: 354, onsite: 414 },
      { name: "谢作林", division: "产品五部", review: 109, production: 98, onsite: 161 },
      { name: "周超", division: "产品五部", review: 25, production: 38, onsite: 88 },
      { name: "朱慧慧", division: "FPC事业部", review: 80, production: 358, onsite: 312 },
      { name: "王辉", division: "FPC事业部", review: 272, production: 179, onsite: 283 },
      { name: "罗超", division: "FPC事业部", review: 172, production: 297, onsite: 281 },
      { name: "林秋秋", division: "FPC事业部", review: 106, production: 107, onsite: 158 },
      { name: "李亚龙", division: "FPC事业部", review: 24, production: 139, onsite: 113 },
      { name: "北美项目部", division: "半导体&北美", review: 74, production: 52, onsite: 34 },
      { name: "传感器产品部", division: "半导体&北美", review: 74, production: 50, onsite: 92 },
      { name: "IC载板", division: "半导体&北美", review: 0, production: 152, onsite: 0 },
    ],
    categories: [
      { name: "结构设计/机构优化", review: 257, production: 184, onsite: 173 },
      { name: "功能/性能/稳定性", review: 112, production: 164, onsite: 334 },
      { name: "孔位/安装/配合", review: 73, production: 145, onsite: 199 },
      { name: "结构干涉/空间", review: 54, production: 151, onsite: 137 },
      { name: "软件/通讯/界面", review: 45, production: 101, onsite: 116 },
      { name: "PLC/控制逻辑", review: 38, production: 125, onsite: 81 },
    ],
  },
  actions: [
    { id: "QA-001", priority: "P0", title: "海易鸿铜件尺寸专项", owner: "SQE/海易鸿", due: "07-31", progress: 65, status: "进行中", module: "IQC" },
    { id: "QA-002", priority: "P0", title: "外包工坊螺丝接线加严", owner: "IPQC/生产", due: "07-31", progress: 42, status: "进行中", module: "IPQC" },
    { id: "QA-003", priority: "P0", title: "林秋秋联合发货门禁", owner: "OQC/DQA", due: "立即", progress: 28, status: "进行中", module: "OQC" },
    { id: "QA-004", priority: "P0", title: "产品五部机构评审门禁", owner: "DQA/产品五部", due: "08-15", progress: 35, status: "进行中", module: "DQA" },
    { id: "QA-005", priority: "P1", title: "FPC PLC/SW代码评审", owner: "罗超", due: "08-31", progress: 18, status: "未开始", module: "DQA" },
    { id: "QA-006", priority: "P1", title: "OQC上下料500循环", owner: "测试/TPM", due: "08-31", progress: 54, status: "进行中", module: "OQC" },
  ],
  ipdMatrix: [
    { stage: "TR1 需求", review: 41, production: 6, onsite: 31, gate: "需求基线签字" },
    { stage: "TR2 方案", review: 257, production: 184, onsite: 173, gate: "机构计算/仿真" },
    { stage: "TR3 设计", review: 210, production: 522, onsite: 493, gate: "干涉/尺寸链/代码评审" },
    { stage: "TR4 发布", review: 65, production: 164, onsite: 98, gate: "BOM与资料齐套" },
    { stage: "TR5 验证", review: 112, production: 164, onsite: 334, gate: "FAT与稳定性测试" },
    { stage: "TR6 量产", review: 0, production: 0, onsite: 545, gate: "8D与横向展开" },
  ],
};

const dqaStageValues = ["评审", "生产", "现场"];
const dqaCategoryValues = sampleData.dqa.categories.map((row) => row.name);
const dqaDisciplineValues = ["ME", "测试ME", "结构ME", "PLC", "EE", "SW"];
const distribute = (total, values, seed = 0) => {
  const weights = values.map((_, index) => Math.max(1, values.length - index + (seed % 3)));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const counts = {};
  let used = 0;
  values.forEach((value, index) => {
    const count = index === values.length - 1 ? Math.max(0, total - used) : Math.round(total * weights[index] / weightTotal);
    counts[value] = count; used += count;
  });
  return counts;
};
const yearRows = (name, totals, values, seed) => ({
  name,
  years: [2025, 2026].map((year, index) => {
    const total = totals[index];
    return { year, total, counts: distribute(total, values, seed + index) };
  }),
});
const stageRows = sampleData.dqa.divisions.map((row) => ({
  name: row.name,
  years: [
    { year: 2025, counts: { 评审: Math.round(row.review * .82), 生产: Math.round(row.production * .78), 现场: Math.round(row.onsite * .72) } },
    { year: 2026, counts: { 评审: row.review, 生产: row.production, 现场: row.onsite } },
  ].map((item) => ({ ...item, total: Object.values(item.counts).reduce((sum, value) => sum + value, 0) })),
}));
const dqaTpms = Object.fromEntries(["半导体&北美", "产品五部", "FPC事业部"].map((division) => [
  division,
  sampleData.dqa.tpmStages.filter((row) => row.division === division).map((row) => row.name),
]));
sampleData.dqa.yearCompare = {
  divisionNames: ["半导体&北美", "产品五部", "FPC事业部"],
  stageValues: dqaStageValues,
  categoryValues: dqaCategoryValues,
  disciplineValues: dqaDisciplineValues,
  tpmsByDivision: dqaTpms,
  byDivision: {
    stages: stageRows,
    categories: stageRows.map((row, index) => yearRows(row.name, row.years.map((year) => year.total - year.counts.评审), dqaCategoryValues, index)),
    disciplines: stageRows.map((row, index) => yearRows(row.name, row.years.map((year) => year.total - year.counts.评审), dqaDisciplineValues, index + 2)),
  },
  byTpm: Object.fromEntries(["半导体&北美", "产品五部", "FPC事业部"].map((division) => {
    const source = sampleData.dqa.tpmStages.filter((row) => row.division === division);
    const stages = source.map((row) => ({
      name: row.name,
      years: [
        { year: 2025, counts: { 评审: Math.round(row.review * .8), 生产: Math.round(row.production * .76), 现场: Math.round(row.onsite * .7) } },
        { year: 2026, counts: { 评审: row.review, 生产: row.production, 现场: row.onsite } },
      ].map((item) => ({ ...item, total: Object.values(item.counts).reduce((sum, value) => sum + value, 0) })),
    }));
    return [division, {
      stages,
      categories: stages.map((row, index) => yearRows(row.name, row.years.map((year) => year.total - year.counts.评审), dqaCategoryValues, index)),
      disciplines: stages.map((row, index) => yearRows(row.name, row.years.map((year) => year.total - year.counts.评审), dqaDisciplineValues, index + 1)),
    }];
  })),
};
