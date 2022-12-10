import { warnOnce } from '../../shared/lib/utils/warn-once'

if (process.env.NODE_ENV !== 'production') {
  warnOnce(
    `You're using \`next/head\` inside app directory, please migrate to \`head.js\`. Checkout https://beta.nextjs.org/docs/api-reference/file-conventions/head for details.`
  )
}

export default function NoopHead() {
  return null
}
