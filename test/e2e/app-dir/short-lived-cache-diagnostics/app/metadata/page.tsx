import { shortExpire } from '../cache'
export const instant = true
export async function generateMetadata() {
  return { title: await shortExpire() }
}
export default function Page() {
  return <p>Page</p>
}
