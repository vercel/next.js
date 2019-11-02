# AMP Validation

AMP pages are automatically validated with [amphtml-validator](https://www.npmjs.com/package/amphtml-validator) during development. Errors and warnings will appear in the terminal where you started Next.js.

Pages are also validated during [Static HTML export](https://www.notion.so/zeithq/Static-HTML-export-2657c5c1bbcd457a94562194f944978c) and any warnings / errors will be printed to the terminal. Any AMP errors will cause the export to exit with status code `1` because the export is not valid AMP.
