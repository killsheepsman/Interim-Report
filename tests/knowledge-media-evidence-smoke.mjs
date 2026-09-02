import assert from "node:assert/strict";
import { buildImageEvidenceClauses, buildPptTextEvidenceClauses, buildTimedEvidenceClauses } from "../server/knowledgeService.mjs";

const document = { id: "doc-media", name: "媒体证据", fileHash: "media-hash", version: "1.0" };

const imageClauses = buildImageEvidenceClauses(document, {
  width: 1200,
  height: 800,
  lines: [{ text: "气缸竖直安装必须验证防坠落。", words: [{ boundingRect: [100, 80, 300, 40] }, { boundingRect: [410, 80, 260, 40] }] }],
}, { locatorType: "ppt-image", locator: "幻灯片 2 · 图片 1", slide: 2, slideCropBox: [10, 20, 300, 200], slideCoordinateUnit: "EMU", sourceFormat: "pptx-image" });
assert.equal(imageClauses.length, 1);
assert.deepEqual(imageClauses[0].metadata.sourceLocation.cropBox, [100, 80, 570, 40]);
assert.deepEqual(imageClauses[0].metadata.sourceLocation.slideCropBox, [10, 20, 300, 200]);
assert.equal(imageClauses[0].metadata.reviewStatus, "pending");

const pptClauses = buildPptTextEvidenceClauses(document, [{ slide: 3, texts: ["首件确认后方可批量组装。", "参数变更需要重新验证。"] }]);
assert.equal(pptClauses.length, 1);
assert.equal(pptClauses[0].metadata.sourceLocation.slide, 3);
assert.match(pptClauses[0].clauseText, /参数变更/);

const timedClauses = buildTimedEvidenceClauses({
  ...document,
  sourceText: "装配前必须确认定位基准稳定。\n参数变更后必须重新验证。",
  contentType: "video-transcript",
  metadata: { segmentMetadata: [
    { locatorType: "video-timestamp", locator: "00:00:01.000—00:00:04.000", startSeconds: 1, endSeconds: 4 },
    { locatorType: "video-timestamp", locator: "00:00:05.000—00:00:08.000", startSeconds: 5, endSeconds: 8 },
  ] },
});
assert.equal(timedClauses.length, 2);
assert.equal(timedClauses[1].metadata.sourceLocation.startSeconds, 5);
assert.equal(timedClauses[1].metadata.sourceFormat, "video-transcript");

console.log("knowledge media evidence smoke passed");
