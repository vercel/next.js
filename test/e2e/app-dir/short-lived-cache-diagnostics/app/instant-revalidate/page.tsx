import { zeroRevalidate } from '../cache'
export const instant = true
async function Content() {
  return <p>{await zeroRevalidate()}</p>
}
export default function Page() {
  return <Content />
}
