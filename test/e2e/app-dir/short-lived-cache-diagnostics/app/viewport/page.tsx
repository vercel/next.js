import { shortExpire } from '../cache'
export const instant = true
export async function generateViewport() {
  return { themeColor: await shortExpire() }
}
export default function Page() {
  return <p>Page</p>
}
