import * as Sentry from '@sentry/node'
import { RewriteFrames } from '@sentry/integrations'

export default async function initServer() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    integrations: [
      new RewriteFrames({
        iteratee: (frame) => {
          frame.filename = frame.filename.replace(
            /\S+\/\.next\//,
            'app:///_next/'
          )
          frame.filename = frame.filename.replace(
            /\S+\/node_modules\//,
            'app:///node_modules/'
          )
          return frame
        },
      }),
    ],
  })
}
