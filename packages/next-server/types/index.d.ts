/**
 * `Config` type, use it for export const config
 */
export type PageConfig = {
  amp?: boolean | 'hybrid'
  api?: {
    bodyParser?: boolean
  }
  prerender?: boolean
}
