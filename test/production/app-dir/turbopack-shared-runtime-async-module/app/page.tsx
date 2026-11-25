// @ts-expect-error -- resolved through the turbopack loader rule in next.config.js
import { value } from './data.sync-txt'

export default function Page() {
  return <p>hello world {value}</p>
}
