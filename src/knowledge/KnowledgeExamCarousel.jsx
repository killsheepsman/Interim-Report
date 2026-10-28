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
const statusText = (file, awaitingReview, processing, job) => {
  if (job?.status === "paused") return "蒸馏已暂停";
  if (job?.status === "failed") return "蒸馏失败";
  if (job?.status === "waiting") return "等待蒸馏";
  if (job?.status === "running") return "正在蒸馏";
  if (file.status === "indexing") return "正在整理证据";
  if (file.status === "parsing") return "正在解析证据";
  if (file.status === "waiting") return "等待解析";
  return file.status === "review_required" ? "需要复核/重试" : awaitingReview ? "OCR待人工复核" : file.status === "completed" ? "已完成" : file.status === "failed" ? "处理失败" : file.status === "distilling" ? "正在蒸馏" : file.status === "registered" ? "已登记待解析" : processing ? "后台处理中" : "本机旧记录";
};
const distillProgress = (job) => {
  if (!job || !["waiting", "running", "paused", "failed"].includes(job.status)) return null;
  const batches = job.result?.batches || [];
  const total = Number(job.result?.totalBatches || batches.length || 0);
  const done = batches.filter((batch) => batch.status === "completed").length;
  const running = batches.filter((batch) => batch.status === "running").length;
  const percent = Number.isFinite(Number(job.progress)) ? Math.max(0, Math.min(100, Math.round(Number(job.progress)))) : (total ? Math.round(done / total * 100) : 0);
  const message = job.status === "paused" ? "已暂停。点「继续蒸馏」接着做。" : job.status === "failed" ? (job.errorMessage || job.message || "蒸馏失败") : job.status === "waiting" ? "排队中，还没开始这一批。" : (job.message || (running ? "正在处理当前批次。" : "正在蒸馏。"));
  return { percent, total, done, message, status: job.status, startedAt: job.startedAt || job.createdAt || "", updatedAt: job.updatedAt || "" };
};
const elapsedText = (progress, now) => {
  if (!progress?.startedAt) return "";
  const start = new Date(progress.startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const frozen = ["paused", "failed", "completed"].includes(progress.status);
  const end = frozen ? new Date(progress.updatedAt || now).getTime() : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return "已用 " + seconds + "秒";
  return "已用 " + Math.floor(seconds / 60) + "分" + String(seconds % 60).padStart(2, "0") + "秒";
};
const parseProgress = (file, job) => {
  const jobActive = job && ["waiting", "running", "paused"].includes(job.status) && job.jobType !== "distill";
  const fileActive = ["waiting", "parsing", "indexing"].includes(file.status);
  if (!jobActive && !fileActive) return null;
  const source = jobActive ? job : file;
  const raw = Number(source.progress);
  const percent = Number.isFinite(raw) ? Math.max(3, Math.min(99, Math.round(raw))) : 3;
  const message = String(source.message || "正在解析证据").split(" · 证据解析：")[0] || "正在解析证据";
  return { percent, total: 0, done: 0, message, status: jobActive ? job.status : "running", startedAt: job?.startedAt || job?.createdAt || file.metadata?.processingStages?.evidence?.startedAt || "", updatedAt: job?.updatedAt || file.updatedAt || "" };
};
const workProgress = (file, facts) => {
  if (["waiting", "parsing", "indexing"].includes(file.status)) return parseProgress(file, facts.activeParseJob);
  return distillProgress(facts.activeDistillJob);
};
const distillationCardText = (file, job) => {
  const current = Math.max(Number(file?.distillationCount || 0), Number(job?.result?.knowledgeCount || 0));
  const active = file?.status === "distilling" || ["waiting", "running", "paused", "failed"].includes(job?.status);
  if (!active) return current + " 张卡片";
  const batches = Array.isArray(job?.result?.batches) ? job.result.batches : [];
  const totalBatches = Number(job?.result?.totalBatches || job?.result?.batchSummary?.total || batches.length || 0);
  const doneBatches = Number(job?.result?.batchSummary?.completed || batches.filter((batch) => batch.status === "completed").length || 0);
  const batchText = totalBatches ? " · " + doneBatches + "/" + totalBatches + "批" : "";
  return "已生成 " + current + " 张" + batchText;
};
const knowledgeCardMeter = (file, job) => {
  const published = Number(file?.metadata?.publishedKnowledgeCount || 0);
  const saved = Math.max(Number(file?.distillationCount || 0), Number(job?.result?.knowledgeCount || 0));
  const cards = Math.max(saved, published);
  const active = file?.status === "distilling" || ["waiting", "running", "paused", "failed"].includes(job?.status);
  const expected = cards;
  const estimated = false;
  const green = cards > 0 ? Math.max(0, Math.min(100, Math.round(published / cards * 100))) : 0;
  const progress = active ? Math.max(0, Math.min(99, Math.round(Number(file?.progress || 0)))) : 0;
  return { published, cards, expected, active, estimated, green, progress };
};
function KnowledgeCardBar({ meter }) {
  const title = meter.active ? "已生成 " + meter.cards + " 张，按批次进度显示" : "已发布 " + meter.published + " 张 · 知识卡片 " + (meter.estimated ? "约 " : "") + meter.cards + " 张";
  return <i className={"knowledge-card-bar" + ((meter.cards || meter.active) ? "" : " is-empty")} title={title} aria-label={title}>{meter.active ? <b className="is-published" style={{ width: meter.progress + "%" }} /> : <>{meter.cards > 0 && <b className="is-published" style={{ width: meter.green + "%" }} />}{meter.cards > 0 && <b className="is-cards" style={{ width: (100 - meter.green) + "%" }} />}</>}</i>;
}

const fileFacts = (file, documentJobs = {}) => {
  const processing = ["waiting", "parsing", "indexing", "distilling"].includes(file.status);
  const reviewStatus = file.metadata?.reviewStatus || "not_required";
  const ocrPages = Number(file.metadata?.ocrPageCount || 0);
  const reviewCount = Number(file.metadata?.reviewPageCount || ocrPages || 0);
  const awaitingReview = reviewCount > 0 && reviewStatus !== "approved";
  const activeDistillJob = documentJobs[file.id]?.distill;
  const activeParseJob = documentJobs[file.id]?.parse;
  const failedBatchCount = (activeDistillJob?.result?.batches || []).filter((batch) => batch.status === "failed").length;
  const failedPages = Number(file.metadata?.failedPageCount || file.metadata?.failedPageNumbers?.length || 0);
  return { processing, reviewStatus, ocrPages, reviewCount, awaitingReview, activeDistillJob, activeParseJob, failedBatchCount, failedPages, canDistill: file.status === "completed" && !awaitingReview };
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
  const progress = facts ? workProgress(front, facts) : null;
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
    { key: "distill", label: distillingId === front.id ? "正在蒸馏…" : (front.distillationCount || facts.activeDistillJob) ? "重新蒸馏" : "蒸馏知识", icon: <Sparkle size={14}/>, show: true, enabled: Boolean(selectedKnowledgeSkillId) && facts.canDistill && !locked, onClick: () => onDistill(front) },
    { key: "exam", label: generatingId === front.id ? "正在生成…" : front.examQuestionCount ? "重新出题" : "生成题目", icon: <Brain size={14}/>, show: true, enabled: Boolean(selectedExamSkillId) && Boolean(front.preview) && !facts.awaitingReview && front.status === "completed" && !locked, onClick: () => onGenerateExam(front) },
    { key: "delete", label: "删除", icon: <Trash size={14}/>, show: true, enabled: Boolean(front?.id) && !locked, danger: true, onClick: () => onDelete({ id: front.id, name: front.name }) },
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
          <footer><b>{statusText(file, itemFacts.awaitingReview, itemFacts.processing, itemFacts.activeDistillJob)}</b><small>{["waiting", "parsing", "indexing"].includes(file.status) && workProgress(file, itemFacts)?.message ? workProgress(file, itemFacts).message : `${file.clauseCount || 0} 条证据 · ${distillationCardText(file, itemFacts.activeDistillJob)}`}</small>{elapsedText(workProgress(file, itemFacts), processingClock) ? <small className="knowledge-orbit-elapsed">{elapsedText(workProgress(file, itemFacts), processingClock)}</small> : null}<KnowledgeCardBar meter={knowledgeCardMeter(file, itemFacts.activeDistillJob)} /></footer>
        </article>;
      })}
    </div>
    {front && <section className="knowledge-orbit-dock">
      <strong>{front.name}</strong>
      <p>{turning ? "正在转动，按钮暂不可点" : `${statusText(front, facts.awaitingReview, facts.processing, facts.activeDistillJob)} · ${front.clauseCount || 0} 条证据 · ${distillationCardText(front, facts.activeDistillJob)}`}{elapsedText(progress, processingClock) ? ` · ${elapsedText(progress, processingClock)}` : (!progress && timingLabel ? ` · ${timingLabel(front, processingClock) || ""}` : "")}{generationStates[front.id]?.message ? ` · ${generationStates[front.id].message}` : ""}</p>
      {(() => { const meter = knowledgeCardMeter(front, facts.activeDistillJob); return <div className="knowledge-orbit-meters" aria-label="知识卡片数量"><div><b>知识卡片</b><span>{meter.active ? "已生成 " + meter.cards + " 张" : (meter.estimated ? "约 " : "") + meter.cards + " 张"}</span></div><KnowledgeCardBar meter={meter} />{facts.activeDistillJob?.status === "failed" && progress?.message ? <small>{progress.message}</small> : null}</div>; })()}
      <div className="knowledge-orbit-actions">
        {buttons.map((button) => button.file ? <label key={button.key} className={`qmdp-secondary-btn ${button.enabled ? "" : "is-disabled"}`}>{button.icon}{button.label}<input type="file" accept=".json,.md" disabled={!button.enabled} onChange={(event) => onImportDistillation(front, event)}/></label> : <button key={button.key} type="button" className={button.danger ? "qmdp-danger-btn" : button.primary ? "qmdp-primary-btn" : "qmdp-secondary-btn"} disabled={!button.enabled} onClick={(event) => { event.stopPropagation(); button.onClick?.(); }}>{button.icon}{button.label}</button>)}
      </div>
    </section>}
  </div>;
}
