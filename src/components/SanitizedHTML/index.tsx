import React from "react";
import DOMPurify from "dompurify";
import type { Config } from "dompurify";

interface SanitizedHTMLProps {
  html: string;
  config?: Config;
  className?: string;
  tagName?: keyof React.JSX.IntrinsicElements; // 使用更准确的类型定义
}

const DEFAULT_CONFIG: Config = {
  ALLOWED_TAGS: ["b", "i", "u", "a", "p", "br", "strong", "em"],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ADD_ATTR: ["target"],
  FORBID_ATTR: ["style", "onerror", "onload", "onmouseover"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
};

const SanitizedHTML: React.FC<SanitizedHTMLProps> = ({
  html,
  config = DEFAULT_CONFIG,
  className,
  tagName: Tag = "div",
}) => {
  const sanitizedHTML = DOMPurify.sanitize(html, config); // 直接调用

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};

export default SanitizedHTML;
