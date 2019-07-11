/**
 * `Config` type, use it for export const config
 */
export type PageConfig = {
  amp?: boolean | 'hybrid'
  api?: {
    bodyParser?: boolean
    /**
     * The byte limit of the body. This is the number of bytes or any string
     * format supported by `bytes`, for example `1000`, `'500kb'` or `'3mb'`.
     */
    bodySizeLimit?: number | string
  }
  experimentalPrerender?: boolean | 'inline' | 'legacy'
}
