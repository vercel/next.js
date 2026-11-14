import { Posts } from '../posts'

export default function Page() {
  return (
    <Posts load={(url) => fetch(new Request(url, { cache: 'no-store' }))} />
  )
}
