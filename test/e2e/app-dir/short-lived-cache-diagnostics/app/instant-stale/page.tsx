import { unprefetchable } from '../cache'
export const instant = true
async function Content() {
  return <p>{await unprefetchable()}</p>
}
export default function Page() {
  return <Content />
}
