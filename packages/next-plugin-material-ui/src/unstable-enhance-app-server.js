import { ServerStyleSheets } from '@material-ui/styles'

export default async function enhanceApp (ctx) {
  ctx.sheets = new ServerStyleSheets()
  return App => props => ctx.sheets.collect(<App {...props} />)
}
