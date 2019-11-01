export default async function getStyles (ctx) {
  return ctx.sheets.getStyleElement()
}
