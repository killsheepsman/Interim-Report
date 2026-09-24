const PROBLEM_BY_CODE = {
  401: "API 密钥无效或未配置",
  403: "当前密钥没有调用这个模型的权限",
  404: "模型名称不存在或不支持",
  429: "模型接口限流，请求太频繁",
  500: "模型服务内部出错",
  502: "模型网关连不上后面的服务",
  503: "模型服务暂时不可用",
  504: "模型响应超时",
  520: "模型网关后面的服务返回了未知错误",
  521: "模型服务没开着",
  522: "连接模型服务超时",
  523: "找不到模型服务",
  524: "模型在网关等待时间内没返回",
};

const statusCodeFrom = (error) => {
  const raw = String(error?.message || error || "");
  const matched = raw.match(/\b(401|403|404|429|5\d\d)\b/);
  return Number(error?.status || error?.statusCode || (matched && matched[1]) || 0);
};

const stripHtml = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

export const describeAiError = (error, fallback = "模型请求失败") => {
  const raw = String(error?.message || error || "");
  const code = statusCodeFrom(error);
  const problem = PROBLEM_BY_CODE[code];
  if (problem) return `问题：${problem}（${code}）`;
  if (/<!DOCTYPE html|<html/i.test(raw) || /web server is returning an unknown error/i.test(raw)) {
    return "问题：模型网关返回了网页错误页，不是分析结果";
  }
  const cleaned = stripHtml(raw).slice(0, 140);
  return cleaned ? `问题：${cleaned}` : `问题：${fallback}`;
};
