import { shortStale } from '../../cache'
export const instant = true
async function Content() {
  return <p>{await shortStale()}</p>
}
export default function Page() {
  return <Content />
}
