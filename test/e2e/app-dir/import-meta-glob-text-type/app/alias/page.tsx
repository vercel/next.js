// `alpha.md` is loaded by a `type: 'raw'` rule, `alpha.mdx` by a `type: 'text'`
// rule. The files have identical contents, so the imports must be identical.
// @ts-expect-error -- untyped module
import raw from './alpha.md'
// @ts-expect-error -- untyped module
import text from './alpha.mdx'

export default function Page() {
  return (
    <>
      <p id="raw">{JSON.stringify(raw)}</p>
      <p id="equal">{String(raw === text)}</p>
    </>
  )
}
