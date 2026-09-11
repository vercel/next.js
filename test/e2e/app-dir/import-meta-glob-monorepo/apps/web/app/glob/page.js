// `/content/where` exists both in apps/web (the Next.js project directory) and at
// the workspace root, with different contents, so the value that comes back says
// which root was used. It has to be the project directory, for both a plain
// import and a `/`-rooted `import.meta.glob` pattern — the two can't disagree
// about what `/` means.
//
// JavaScript, not TypeScript: TypeScript resolves a leading `/` as an absolute
// path on disk, so it can't type a `/`-rooted import.
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
