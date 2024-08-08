import { useId } from 'react'

export default function Page() {
  return <div id="id">{useId()}</div>
}
