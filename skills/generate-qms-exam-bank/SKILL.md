---
name: generate-qms-exam-bank
description: Generate import-ready QMS exam-bank Excel files from Word knowledge documents using a provided "题库导入模板.xlsx" template. Use when the user asks to read one or more QMS/quality knowledge .docx files, create exam questions, produce 10 single-choice questions and 10 true/false questions per document unless otherwise specified, conform to the template columns such as 题干、类型、选项A-D、正确答案、解析、适用角色、问题类别、知识标题, validate the workbook, and export .xlsx files.
---

# Generate QMS Exam Bank

Use this skill to turn QMS knowledge Word documents into import-ready Excel question banks.

## Workflow

1. Use the `documents` and `spreadsheets` skills when available.
2. Inspect the provided template workbook first. Confirm the header row and preserve all non-question sheets such as `填写说明`.
3. Extract the source `.docx` text with bundled Python `python-docx`. Include paragraphs and useful table text.
4. For each source document, write exactly the requested number of questions. Default: `10` `单选题` and `10` `判断题` per document.
5. Prefer questions based on purpose, scope, definitions, responsibilities, workflow steps, required/forbidden rules, numeric thresholds, design principles, inspection points, and safety cautions.
6. Avoid vague questions. Each answer and explanation should be traceable to the source document.
7. Keep every answer text within 50 characters. For single-choice questions this limit applies to the correct option text; explanations are not included in the limit.
8. Create a JSON spec with rows that match the template columns, then run `scripts/create_exam_bank.py`.
9. Verify each output workbook:
   - sheet `题库模板` exists
   - headers match the template
   - each document has the required number of rows
   - `单选题` rows have options A-D and answer A/B/C/D
   - `判断题` rows have options `正确`/`错误` and answer `正确` or `错误`
10. Export files using source-document names plus `_考试试题.xlsx` unless the user asks for different names.

## JSON Spec Format

Pass one JSON file to the bundled script:

```json
{
  "template": "C:/path/题库导入模板.xlsx",
  "output_dir": "C:/path/output",
  "workbooks": [
    {
      "output_filename": "QS-QP08-RE18 标准气路设计规范--V2.0_考试试题.xlsx",
      "rows": [
        {
          "题干": "标准气路设计规范的主要目的是什么？",
          "类型": "单选题",
          "选项A": "统一气路设计要求并减少低级错误",
          "选项B": "替代所有国标文件",
          "选项C": "只规定采购价格",
          "选项D": "只规定设备外观颜色",
          "正确答案": "A",
          "解析": "规范用于统一技术设计文件、提高设计效率并避免气路低级错误。",
          "适用角色": "机械工程师",
          "问题类别": "标准气路设计",
          "知识标题": "QS-QP08-RE18 标准气路设计规范"
        }
      ]
    }
  ]
}
```

## Script Usage

```powershell
& '<bundled-python>\python.exe' '<skill-dir>\scripts\create_exam_bank.py' --spec '<path-to-spec.json>'
```

If writing to the final destination is outside the writable workspace, generate to the workspace `outputs` directory first, then request escalation to copy to the user's requested folder.
