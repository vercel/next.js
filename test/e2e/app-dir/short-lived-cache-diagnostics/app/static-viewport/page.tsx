import { shortExpire } from '../cache'
export const ensureStatic = 'navigation'
export async function generateViewport() {
  return { themeColor: await shortExpire() }
}
export default function Page() {
  return <p>Page</p>
}
