import { shortExpire } from '../cache'
export const instant = true
async function Content() {
  return <p>{await shortExpire()}</p>
}
export default function Page() {
  return <Content />
}
