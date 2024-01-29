import { headers } from 'next/headers'

export async function Optimistic() {
  try {
    const h = headers()
    return <div id="fooheader">foo header: {h.get('x-foo')}</div>
  } catch (err) {
    return <div id="fooheader">foo header: optimistic</div>
  }
}
