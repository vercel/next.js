const nextTranslate = require("next-translate-plugin");

// Note: only available in Next.js +16 (for 15, you need to force a boolean)
const isTurbopack = !process.argv.includes('--webpack');

module.exports = nextTranslate({}, { turbopack: isTurbopack });
