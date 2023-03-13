import { PHASE_PRODUCTION_BUILD } from 'next/constants'

const { NODE_ENV } = process.env
const { NEXT_PHASE } = process.env
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (NODE_ENV !== 'development' && NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
  console.log('next start', SENTRY_DSN)
}

export default () => process.env.HELLO || 'hi'
