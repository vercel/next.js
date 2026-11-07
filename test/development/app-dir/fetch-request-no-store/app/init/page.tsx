import { Posts } from '../posts'

export default function Page() {
  return <Posts load={(url) => fetch(url, { cache: 'no-store' })} />
}
