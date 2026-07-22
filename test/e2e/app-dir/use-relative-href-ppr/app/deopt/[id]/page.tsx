import { RelativeHrefs } from '../../relative-hrefs'

export default function DeoptPage() {
  // '/deopt' is pure traversal ('./'), invariant to the unknown [id], so it
  // stays in the fallback shell. The own route '/deopt/[id]' and its
  // descendant must respell the page's final segment — the [id] value
  // itself — so both deopt to dynamic holes in the shell.
  return (
    <>
      <div id="deopt-page">Deopt</div>
      <RelativeHrefs
        id="deopt-page-hrefs"
        targets={['/deopt', '/deopt/[id]', '/deopt/[id]/edit']}
      />
    </>
  )
}
