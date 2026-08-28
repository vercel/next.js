// The same `/content/where` that `/server-relative-import` imports directly, but
// reached through a `/`-rooted `import.meta.glob` pattern. Both have to resolve
// from the project directory (apps/web), so both have to report the same value —
// a glob and a plain import can't disagree about what `/` means.
//
// This page is JavaScript for the same reason the plain-import one is: TypeScript
// resolves a leading `/` as an absolute path on disk.
import where from '/content/where'

const globbed = import.meta.glob('/content/*', { eager: true })

export default function Page() {
  return (
    <>
      <p id="import">{where}</p>
      <p id="glob-keys">{JSON.stringify(Object.keys(globbed))}</p>
      <p id="glob-value">{globbed['/content/where.ts'].default}</p>
    </>
  )
}
