module.exports = {
  extends: ["next"],
  rules: {
    "@next/next/no-html-link-for-pages": ["error", { pageExtensions: ["page.tsx"] }]
  }
}
