import DOMPurify from "isomorphic-dompurify";

// Allowlist derived from the actual content of a typical Medium RSS feed:
// structural tags, headings, lists, inline formatting, code, links, and
// images. Anything else (scripts, event handlers, style attrs) is stripped.
const ALLOWED_TAGS = [
  // Structural
  "p",
  "blockquote",
  "hr",
  "figure",
  "figcaption",
  // Headings
  "h2",
  "h3",
  "h4",
  // Lists
  "ul",
  "ol",
  "li",
  // Inline formatting
  "em",
  "strong",
  "code",
  // Code blocks
  "pre",
  // Links + media
  "a",
  "img",
];

// Array form (not the per-tag object form) — DOMPurify's TS types only
// accept this. Functionally equivalent since <img> is the only allowlisted
// tag that takes width/height.
const ALLOWED_ATTR = ["href", "src", "alt", "width", "height"];

// Negative lookahead: allow anything EXCEPT dangerous schemes. DOMPurify v3
// applies ALLOWED_URI_REGEXP to ALL attribute values (not just href/src), so
// a positive pattern like `^https?:` would also strip width/height/title text.
const ALLOWED_URI_REGEXP = /^(?!(?:javascript|data|vbscript|file):)/i;

// DOMPurify v3 special-cases data:image/* and re-adds it even when
// ALLOWED_URI_REGEXP would reject. Close that hole with an explicit hook.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node && node.nodeType === 1 && (node as Element).tagName === "IMG") {
    const el = node as Element;
    const src = el.getAttribute("src");
    if (src && /^data:/i.test(src)) {
      el.removeAttribute("src");
    }
  }
});

export function sanitizeMediumHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
    FORBID_ATTR: ["style", "class", "title"],
  });
}