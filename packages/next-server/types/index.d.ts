import {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
} from 'next-server/dist/lib/utils'
import { RouterUrl } from 'next-server/dist/lib/router/router'

/**
 * `Config` type, use it for export const config
 */
export type PageConfig = {
  amp?: boolean | 'hybrid'
  api?: {
    bodyParser?: boolean
  }
  experimentalPrerender?: boolean | 'inline' | 'legacy'
}

export {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  RouterUrl,
}
