// export default function Page() {
//   return <p>hello world</p>
// }

'use client'
export default function Page() {
  return typeof window === 'undefined' ? 'HELLO' : 'WORLD'
}
