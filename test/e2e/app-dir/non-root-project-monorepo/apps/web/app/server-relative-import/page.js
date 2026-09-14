// `/content/where` exists both under the project directory (apps/web) and at the
// workspace root, so which one is loaded says where `/` is rooted. It has to be
// the project directory.
//
// This page is JavaScript on purpose: TypeScript resolves a leading `/` as an
// absolute path on disk, so it can't type a `/`-rooted import (TS2307). Adding a
// tsconfig `paths` mapping for it would make the request match the import map
// instead, which wouldn't exercise the resolution under test.
import where from '/content/where'

export default function Page() {
  return <p id="where">{where}</p>
}
