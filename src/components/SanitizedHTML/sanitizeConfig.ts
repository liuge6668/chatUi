import type { Config } from "dompurify";

export const SANITIZE_CONFIG = {
  // 基础配置 - 只允许基本格式
  BASIC: {
    ALLOWED_TAGS: ["b", "i", "u", "strong", "em"],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  } as Config,

  // 富文本配置 - 允许常见富文本格式
  RICH_TEXT: {
    ALLOWED_TAGS: [
      "b",
      "i",
      "u",
      "a",
      "p",
      "br",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    ADD_ATTR: ["target"],
    FORBID_ATTR: ["style", "onerror", "onload", "onmouseover"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  } as Config,

  // 链接配置 - 专门处理含链接的内容
  LINK: {
    ALLOWED_TAGS: ["a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ADD_ATTR: ["target"],
    ADD_URI_SAFE_ATTR: ["rel"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  } as Config,

  // 严格模式 - 只允许纯文本
  STRICT: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  } as Config,
};

export default SANITIZE_CONFIG;
