// @ts-expect-error -- transformed by the loader configured in next.config.ts
import a from './a.value.txt'
// @ts-expect-error -- transformed by the loader configured in next.config.ts
import b from './b.value.txt'

export default function Page() {
  return (
    <>
      <p id="a">{a}</p>
      <p id="b">{b}</p>
    </>
  )
}
