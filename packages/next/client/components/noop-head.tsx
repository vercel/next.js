import { warnOnce } from '../../shared/lib/utils/warn-once'

export default function NoopHead() {
  if (process.env.NODE_ENV !== 'production') {
    warnOnce(
      `You're using \`next/head\` inside app directory, please migrate to \`head.js\`. Checkout https://beta.nextjs.org/docs/api-reference/file-conventions/head for details.`
    )
  }
  return null
}
