import assert from "node:assert/strict";
import { describeAiError } from "../src/agent/aiErrorMessage.js";

assert.equal(describeAiError({ status: 520, message: "<!DOCTYPE html> ahei.asia 520: Web server is returning an unknown error" }), "问题：模型网关后面的服务返回了未知错误（520）");
assert.equal(describeAiError(new Error("AI上游返回 524：timeout")), "问题：模型在网关等待时间内没返回（524）");
assert.equal(describeAiError(new Error("<!DOCTYPE html><html><title>error</title></html>")).includes("网页错误页"), true);
assert.equal(describeAiError(new Error("已停止本次请求")).startsWith("问题：已停止"), true);

console.log("ai error message smoke test passed");
