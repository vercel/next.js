import nativeAddon from 'native-addon'

// Regression test for turbopack issue 5913: a package that locates and loads its
// compiled binary through `require('bindings')(...)` used to break the build.
//
// `CONTEXT_AWARE` comes from the compiled addon itself, so rendering it proves the
// binary was really loaded. A resolution that produced an empty module would
// render nothing here rather than passing quietly.
export default function Page() {
  return (
    <>
      <h1 id="message">Hello World</h1>
      <p id="context-aware">{String(nativeAddon.CONTEXT_AWARE)}</p>
    </>
  )
}
