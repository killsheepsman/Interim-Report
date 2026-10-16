import { useEffect, useRef, useState } from "react";
import { ArrowsClockwise, ArrowRight, Brain, CheckCircle, Database, Eye, Pause, Rows, Sparkle, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";

const faces = ["#c9b6f2", "#f3a8c4", "#8fd0f2", "#8ed39a", "#f0c27a", "#9eb6f5"];
const duration = 300;
const bezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const error = sampleX(t) - x;
      const slope = sampleDX(t);
      if (Math.abs(error) < 1e-4 || Math.abs(slope) < 1e-4) break;
      t = Math.min(1, Math.max(0, t - error / slope));
    }
    return sampleY(t);
  };
};
const ease = bezier(0.22, 1, 0.36, 1);
const wrap = (deg) => {
  let angle = ((deg % 360) + 360) % 360;
  return angle > 180 ? angle - 360 : angle;
};
const statusText = (file, awaitingReview, processing) => file.status === "review_required" ? "需要复核/重试" : awaitingReview ? "OCR待人工复核" : file.status === "completed" ? "已完成" : file.status === "failed" ? "处理失败" : file.status === "distilling" ? "知识蒸馏中" : file.status === "registered" ? "已登记待解析" : processing ? "后台处理中" : "本机旧记录";

const fileFacts = (file, documentJobs = {}) => {
  const processing = ["waiting", "parsing", "indexing", "distilling"].includes(file.status);
  const reviewStatus = file.metadata?.reviewStatus || "not_required";
  const ocrPages = Number(file.metadata?.ocrPageCount || 0);
  const reviewCount = Number(file.metadata?.reviewPageCount || ocrPages || 0);
  const awaitingReview = reviewCount > 0 && reviewStatus !== "approved";
  const activeDistillJob = documentJobs[file.id]?.distill;
  const failedBatchCount = (activeDistillJob?.result?.batches || []).filter((batch) => batch.status === "failed").length;
  const failedPages = Number(file.metadata?.failedPageCount || file.metadata?.failedPageNumbers?.length || 0);
  return { processing, reviewStatus, ocrPages, reviewCount, awaitingReview, activeDistillJob, failedBatchCount, failedPages, canDistill: file.status === "completed" && !awaitingReview };
};

export function KnowledgeExamCarousel({ files = [], checkedFileIds = [], onToggleFile, generationStates = {}, documentJobs = {}, busy = false, distillingId = "", generatingId = "", selectedKnowledgeSkillId = "", selectedExamSkillId = "", processingClock = Date.now(), timingLabel, onOpenDetail, onImportDistillation, onControlJob, onRetryParse, onRetryFailedParse, onReviewFile, onDistill, onGenerateExam, onDelete }) {
  const stageRef = useRef(null);
  const nodes = useRef(new Map());
  const motion = useRef({ shown: 0, from: 0, to: 0, started: 0, turning: false });
  const filesRef = useRef(files);
  const [frontId, setFrontId] = useState(files[0]?.id || "");
  const [turning, setTurning] = useState(false);
  const frontIdRef = useRef(frontId);
  filesRef.current = files;
  frontIdRef.current = frontId;

  useEffect(() => {
    if (!files.some((file) => file.id === frontId)) setFrontId(files[0]?.id || "");
  }, [files, frontId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !files.length) return undefined;
    let frame = 0;
    const paint = (now) => {
      const list = filesRef.current;
      const count = list.length;
      const motionState = motion.current;
      if (motionState.turning) {
        const progress = Math.min(1, (now - motionState.started) / duration);
        motionState.shown = motionState.from + (motionState.to - motionState.from) * ease(progress);
        if (progress === 1) {
          motionState.turning = false;
          setTurning(false);
        }
      }
      if (count) {
        const step = 360 / count;
        let nearest = list[0];
        let nearestAbs = 999;
        list.forEach((file, index) => {
          const node = nodes.current.get(file.id);
          if (!node) return;
          const angle = wrap(index * step + motionState.shown);
          const abs = Math.abs(angle);
          if (abs < nearestAbs) { nearestAbs = abs; nearest = file; }
          const rad = angle * Math.PI / 180;
          const front = abs < 8;
          const x = Math.sin(rad) * 430;
          const z = Math.cos(rad) * 160;
          const scale = (0.84 + Math.max(0, Math.cos(rad)) * 0.16) * (front ? 1.055 : 1);
          const lift = front ? -14 : 0;
          node.style.transform = `translate3d(${x.toFixed(2)}px, ${lift}px, ${z.toFixed(2)}px) rotateY(${(angle * 0.46).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
          node.style.zIndex = String(1000 - Math.round(abs));
          const fade = abs < 58 ? 1 : abs > 86 ? 0 : (86 - abs) / 28;
          node.style.opacity = fade.toFixed(3);
          node.style.pointerEvents = fade > 0.08 ? "auto" : "none";
        });
        if (nearest && nearest.id !== frontIdRef.current) setFrontId(nearest.id);
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    const onWheel = (event) => {
      event.preventDefault();
      const motionState = motion.current;
      motionState.from = motionState.shown;
      motionState.to += event.deltaY * 0.16;
      motionState.started = performance.now();
      if (!motionState.turning) setTurning(true);
      motionState.turning = true;
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [files.length]);

  const focusFile = (file) => {
    const list = filesRef.current;
    const index = list.findIndex((item) => item.id === file.id);
    if (index < 0 || !list.length) return;
    const motionState = motion.current;
    const angle = wrap(index * (360 / list.length) + motionState.shown);
    motionState.from = motionState.shown;
    motionState.to = motionState.shown - angle;
    motionState.started = performance.now();
    if (!motionState.turning) setTurning(true);
    motionState.turning = true;
  };

  const front = files.find((file) => file.id === frontId) || files[0];
  if (!files.length) return <div className="qmdp-empty"><Database size={30}/><strong>暂无匹配知识文件</strong><span>导入规范、SOP 或经验文档后会显示在这里。</span></div>;
  const facts = front ? fileFacts(front, documentJobs) : null;
  const locked = busy || turning;
  const buttons = front && facts ? [
    { key: "evidence", label: "查看证据", icon: <Rows size={14}/>, show: true, enabled: front.clauseCount > 0 && !locked, onClick: () => onOpenDetail(front, "clauses") },
    { key: "knowledge", label: "复核知识", icon: <Eye size={14}/>, show: true, enabled: front.distillationCount > 0 && !locked, onClick: () => onOpenDetail(front, "knowledge") },
    { key: "import", label: "导入AI结果", icon: <UploadSimple size={14}/>, show: true, enabled: front.clauseCount > 0 && !locked, file: true },
    { key: "pause", label: "暂停蒸馏", icon: <Pause size={14}/>, show: true, enabled: facts.activeDistillJob && ["waiting", "running"].includes(facts.activeDistillJob.status) && !locked, danger: true, onClick: () => onControlJob(front, "pause") },
    { key: "resume", label: "继续蒸馏", icon: <ArrowRight size={14}/>, show: true, enabled: facts.activeDistillJob?.status === "paused" && !locked, primary: true, onClick: () => onControlJob(front, "resume") },
    { key: "retry-batch", label: `只重试失败批次（${facts.failedBatchCount}）`, icon: <ArrowsClockwise size={14}/>, show: true, enabled: facts.activeDistillJob?.status === "failed" && facts.failedBatchCount > 0 && !locked, onClick: () => onControlJob(front, "retry_failed") },
    { key: "reparse", label: "重新解析", icon: <ArrowsClockwise size={14}/>, show: true, enabled: ["failed", "review_required"].includes(front.status) && !locked, onClick: () => onRetryParse(front) },
    { key: "retry-pages", label: "仅重试失败页", icon: <ArrowsClockwise size={14}/>, show: true, enabled: facts.failedPages > 0 && !locked, onClick: () => onRetryFailedParse(front) },
    { key: "approve", label: "复核通过", icon: <CheckCircle size={14}/>, show: true, enabled: facts.awaitingReview && front.clauseCount > 0 && !locked, onClick: () => onReviewFile(front, "approved") },
    { key: "redo", label: "标记需重做", icon: <WarningCircle size={14}/>, show: true, enabled: facts.reviewStatus === "approved" && facts.reviewCount > 0 && !locked, onClick: () => onReviewFile(front, "rejected") },
    { key: "distill", label: distillingId === front.id ? "正在蒸馏…" : front.distillationCount ? "重新蒸馏" : "蒸馏知识", icon: <Sparkle size={14}/>, show: true, enabled: Boolean(selectedKnowledgeSkillId) && facts.canDistill && !locked, onClick: () => onDistill(front) },
    { key: "exam", label: generatingId === front.id ? "正在生成…" : front.examQuestionCount ? "重新出题" : "生成题目", icon: <Brain size={14}/>, show: true, enabled: Boolean(selectedExamSkillId) && Boolean(front.preview) && !facts.awaitingReview && front.status === "completed" && !locked, onClick: () => onGenerateExam(front) },
    { key: "delete", label: "删除", icon: <Trash size={14}/>, show: true, enabled: !locked, danger: true, onClick: () => onDelete(front) },
  ] : [];
  return <div className="knowledge-orbit">
    <div className="knowledge-orbit-stage" ref={stageRef}>
      {files.map((file, index) => {
        const itemFacts = fileFacts(file, documentJobs);
        const checked = checkedFileIds.includes(file.id);
        return <article key={file.id} className="knowledge-orbit-card" ref={(node) => { if (node) nodes.current.set(file.id, node); else nodes.current.delete(file.id); }} style={{ background: faces[index % faces.length] }} onClick={(event) => { if (event.target.closest("[data-pick]")) return; focusFile(file); }}>
          <label className="knowledge-orbit-pick" data-pick onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={() => onToggleFile(file.id)} aria-label={`选择知识文件 ${file.name}`}/>
          </label>
          <span className="knowledge-orbit-tag">{file.category || "未分类"}</span>
          <h3>{file.name}</h3>
          <p>{file.preview || "尚未提取文本；可作为知识文件留档。"}</p>
          <footer><b>{statusText(file, itemFacts.awaitingReview, itemFacts.processing)}</b><small>{file.clauseCount || 0} 条证据 · {file.distillationCount || 0} 张卡片</small></footer>
        </article>;
      })}
    </div>
    {front && <section className="knowledge-orbit-dock">
      <strong>{front.name}</strong>
      <p>{turning ? "正在转动，按钮暂不可点" : `${statusText(front, facts.awaitingReview, facts.processing)} · ${front.clauseCount || 0} 条证据 · ${front.distillationCount || 0} 张卡片`}{timingLabel ? ` · ${timingLabel(front, processingClock) || ""}` : ""}{generationStates[front.id]?.message ? ` · ${generationStates[front.id].message}` : ""}</p>
      <div className="knowledge-orbit-actions">
        {buttons.map((button) => button.file ? <label key={button.key} className={`qmdp-secondary-btn ${button.enabled ? "" : "is-disabled"}`}>{button.icon}{button.label}<input type="file" accept=".json,.md" disabled={!button.enabled} onChange={(event) => onImportDistillation(front, event)}/></label> : <button key={button.key} type="button" className={button.danger ? "qmdp-danger-btn" : button.primary ? "qmdp-primary-btn" : "qmdp-secondary-btn"} disabled={!button.enabled} onClick={button.onClick}>{button.icon}{button.label}</button>)}
      </div>
    </section>}
  </div>;
}
