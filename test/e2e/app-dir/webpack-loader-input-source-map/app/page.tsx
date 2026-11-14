import split from '../fixture.split'
import chain from '../fixture.chain'
import plain from '../fixture.plain'

export default function Page() {
  return (
    <>
      <pre id="split">{JSON.stringify(split)}</pre>
      <pre id="chain">{JSON.stringify(chain)}</pre>
      <pre id="plain">{JSON.stringify(plain)}</pre>
    </>
  )
}
