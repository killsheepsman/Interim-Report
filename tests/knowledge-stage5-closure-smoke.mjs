import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.QMS_DATABASE_URL = " ";
process.env.DATABASE_URL = " ";
const { createKnowledgeService } = await import("../server/knowledgeService.mjs");
const recurrenceId = (module, personName, candidateKey) => `recurrence-${createHash("sha1").update(`${module}:${personName}:${candidateKey}`).digest("hex").slice(0, 20)}`;
const root = await fs.mkdtemp(path.join(os.tmpdir(), "qms-knowledge-stage5-"));

try {
  const filePath = path.join(root, "knowledge.json");
  const now = new Date().toISOString();
  const documents = [{ id: "doc-review", name: "研发设计与组装规范", category: "研发设计规范", sourceLevel: "A", version: "2.0", effectiveStatus: "active", governanceStatus: "已发布", status: "completed", clauseCount: 1, distillationCount: 1, metadata: {} }];
  const knowledge = [{ id: "knowledge-review", documentId: "doc-review", clauseIds: ["clause-review"], type: "review_point", title: "设计与首件评审检查", content: "评审前必须完成干涉检查，组装前必须完成首件确认，并保留验证记录。", processes: ["机械", "评审", "组装"], applicableRoles: ["研发工程师", "组装人员"], sourceLevel: "A", version: "2.0", publicationStatus: "published", metadata: { reviewPoints: ["是否完成3D干涉检查并保存验证记录？"], riskLevel: "high", applicableScope: ["新项目"], projects: ["测试项目"], projectStages: ["设计冻结"], brandModels: ["测试品牌-A1"] }, sourceCitations: [{ clauseId: "clause-review", quote: "评审前必须完成干涉检查，组装前必须完成首件确认，并保留验证记录。" }], createdAt: now, updatedAt: now }];
  const samples = [
    ["IPQC", "组装甲", "错装", "连接器方向装反"], ["IPQC", "组装乙", "漏装", "固定螺钉漏装"], ["IPQC", "组装丙", "扭矩", "关键螺钉扭矩不足"],
    ["DQA", "工程师甲", "干涉", "机构运动范围发生干涉"], ["DQA", "工程师乙", "BOM", "BOM与图纸版本不一致"], ["DQA", "工程师丙", "选型", "传感器量程选型不足"],
  ];
  const candidateKey = "knowledge:knowledge-review";
  const issues = samples.map(([module, personName, issueType, issueText], index) => ({ id: `issue-${index + 1}`, module, personName, issueType, issueText, issueDate: `2026-0${(index % 6) + 1}-10`, sourceFile: "阶段5回归样本.xlsx", sourceKey: `sample:${index + 1}`, metadata: { project: "测试项目", projectStage: "设计冻结", brandModel: "测试品牌-A1" }, createdAt: now, updatedAt: now }));
  const matches = issues.map((issue, index) => ({ id: `match-${index + 1}`, issueId: issue.id, candidateKey, candidateType: "knowledge", documentId: "doc-review", knowledgeId: "knowledge-review", clauseId: "", score: 95, evidence: { documentName: "研发设计与组装规范", candidateTitle: "设计与首件评审检查", quote: knowledge[0].content, sourceLevel: "A" }, status: "confirmed", reviewer: "阶段5回归", reviewedAt: now, createdAt: now, updatedAt: now }));
  await fs.writeFile(filePath, JSON.stringify({ version: 4, documents, clauses: [], jobs: [], knowledge, issues, matches, recurrenceActions: [], reviewSessions: [], feedbackRecords: [] }), "utf8");
  const service = createKnowledgeService({ filePath });

  const points = await service.listReviewPoints({ module: "DQA", process: "机械", risk: "high", project: "测试项目", projectStage: "设计冻结", brandModel: "A1" });
  assert.equal(points.total, 1, "项目、阶段和品牌型号筛选应返回已发布评审点");

  const savedActions = [];
  for (const [module, personName, issueType] of samples) {
    const recurrenceKey = recurrenceId(module, personName, candidateKey);
    const action = await service.saveRecurrenceAction(recurrenceKey, { module, personName, candidateKey, deviation: `${issueType}偏离规范`, rootCause: `${issueType}控制门禁缺失`, scope: "测试项目及同类项目", fallbackPlan: "隔离当前输出并升级复核", actionText: module === "IPQC" ? "增加首件和工装防错门禁" : "增加设计发布和验证证据门禁", owner: `${personName}负责人`, dueDate: "2026-07-01", implementedAt: "2026-07-02", actionType: module === "IPQC" ? "physical" : "logical", verificationMethod: "复核连续批次或项目的执行记录", verificationEvidence: "阶段5回归验证记录：连续3次未复发", observationUntil: "2026-08-01", status: "closed", effectiveness: "effective", metadata: { reviewer: "阶段5回归审核人" } });
    assert.equal(action.status, "closed");
    savedActions.push(action);
  }
  const ipqcRecurrences = await service.listRecurrences({ module: "IPQC", limit: 20 });
  const dqaRecurrences = await service.listRecurrences({ module: "DQA", limit: 20 });
  assert.equal(ipqcRecurrences.recurrences.filter((item) => item.state === "effective").length, 3, "3个IPQC问题应形成有效关闭闭环");
  assert.equal(dqaRecurrences.recurrences.filter((item) => item.state === "effective").length, 3, "3个DQA问题应形成有效关闭闭环");
  await assert.rejects(() => service.saveRecurrenceAction(recurrenceId("IPQC", "组装甲", candidateKey), { module: "IPQC", personName: "组装甲", candidateKey, actionText: "只培训", owner: "负责人", dueDate: "2026-09-10", actionType: "training", status: "closed", effectiveness: "pending" }), /关闭闭环/);

  const reviewPoint = { reviewPointId: points.reviewPoints[0].id, knowledgeId: "knowledge-review", documentId: "doc-review", title: "干涉检查", reviewPoint: points.reviewPoints[0].reviewPoint, result: "pass", note: "已完成", owner: "工程师甲", dueDate: "2026-03-01", evidence: "评审记录附件-001", sourceLevel: "A" };
  const completedReview = await service.saveReviewSession({ module: "DQA", title: "测试项目设计冻结评审", project: "测试项目", projectStage: "设计冻结", brandModel: "测试品牌-A1", riskLevel: "high", owner: "PM甲", collaborators: ["TPM甲"], reviewer: "质量审核人", status: "completed", conclusion: "评审通过", reviewPoints: [reviewPoint] });
  assert.equal(completedReview.status, "completed");
  await assert.rejects(() => service.saveReviewSession({ module: "DQA", title: "不完整评审", owner: "PM甲", reviewer: "质量审核人", status: "completed", conclusion: "尝试关闭", reviewPoints: [{ ...reviewPoint, result: "fail", note: "存在干涉", owner: "", dueDate: "" }] }), /不通过项必须填写/);
  const blocked = await service.saveReviewSession({ module: "DQA", title: "阻断评审", owner: "PM甲", reviewer: "质量审核人", status: "completed", conclusion: "存在不通过项", reviewPoints: [{ ...reviewPoint, result: "fail", note: "存在干涉", owner: "工程师甲", dueDate: "2026-03-10" }] });
  assert.equal(blocked.status, "blocked", "有不通过项时不能标记完成");

  const checklist = await service.saveFeedbackRecord({ sourceType: "recurrence", sourceId: savedActions[0].recurrenceKey, module: "IPQC", targetType: "checklist", title: "首件检查项", content: "增加连接器方向防错确认", owner: "工艺Owner", reviewer: "质量审核人", status: "applied" });
  assert.equal(checklist.status, "applied");
  const dfmea = await service.saveFeedbackRecord({ sourceType: "recurrence", sourceId: savedActions[3].recurrenceKey, module: "DQA", targetType: "dfmea", title: "干涉失效模式", content: "增加运动包络干涉失效模式和预防控制", owner: "研发Owner", reviewer: "质量审核人", status: "approved" });
  assert.equal(dfmea.targetType, "dfmea");
  const questionBank = await service.saveFeedbackRecord({ sourceType: "review", sourceId: completedReview.id, module: "DQA", targetType: "question_bank", title: "干涉检查考点", content: "设计冻结前必须保留哪类干涉验证证据？", owner: "培训Owner", reviewer: "质量审核人", status: "candidate" });
  assert.equal(questionBank.targetType, "question_bank");
  const designRule = await service.saveFeedbackRecord({ sourceType: "review", sourceId: completedReview.id, module: "DQA", targetType: "design_rule", title: "运动包络检查规则", content: "设计冻结前必须完成运动包络干涉检查并保留证据", owner: "设计Owner", reviewer: "质量审核人", status: "applied" });
  assert.equal(designRule.status, "applied");
  await assert.rejects(() => service.saveFeedbackRecord({ sourceType: "recurrence", sourceId: "missing", targetType: "checklist", status: "candidate" }), /已关闭且验证有效/);
  await assert.rejects(() => service.saveFeedbackRecord({ sourceType: "review", sourceId: completedReview.id, targetType: "design_rule", title: "缺审核", content: "内容", status: "applied" }), /Owner和Reviewer/);

  const reopened = await service.saveRecurrenceAction(savedActions[0].recurrenceKey, { ...savedActions[0], status: "open", effectiveness: "pending", metadata: { reopenReason: "措施后再次复发" } });
  assert.equal(reopened.status, "open");
  assert.ok(reopened.metadata.reopenedAt, "复发重开应记录重开时间");
  assert.equal(reopened.metadata.reopenReason, "措施后再次复发");
  const feedback = await service.listFeedbackRecords({ limit: 20 });
  assert.equal(feedback.records.length, 4, "四类反哺对象应进入统一台账");
  console.log("knowledge stage5 closure smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
