import { nanoid } from 'nanoid'

export default function Page() {
  return <h1 id="render-id">{nanoid()}</h1>
}
