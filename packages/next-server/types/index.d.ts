import {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
} from 'next-server/lib/utils'
import { RouterUrl } from 'next-server/lib/router/router'

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
