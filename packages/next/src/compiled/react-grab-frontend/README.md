# React Grab frontend

This is the generated, unmodified React Grab renderer from
[aidenybai/react-grab](https://github.com/aidenybai/react-grab), commit
`ea4bbec9e80f4802e8ae19ad18431edb9ddbb670` (version 0.2.0), with the SolidJS
runtime bundled. The stylesheet comes unchanged from the pinned npm release.

Next.js supplies selection state, hit testing, numbered component identities,
React Fiber source locations, and WebMCP. Three backend imports are replaced at
build time: React update freezing, global interaction freezing, and non-DOM
element adapters. No upstream UI components are copied or rewritten. The build
rejects Fiber instrumentation or backend modules in the output graph.

The upstream canvas color helper uses Next.js blue-700 (`rgb(0, 112, 243)`)
instead of React Grab's magenta. The host supplies the remaining theme through
CSS custom properties; the renderer components remain unchanged.

## Rebuild

After installing the Next.js workspace dependencies:

```sh
git clone https://github.com/aidenybai/react-grab.git /tmp/react-grab-frontend-source
git -C /tmp/react-grab-frontend-source checkout ea4bbec9e80f4802e8ae19ad18431edb9ddbb670
node scripts/build-react-grab-frontend.mjs /tmp/react-grab-frontend-source
```

The generator verifies the source commit and tracked files before building. Its
output includes the upstream renderer declarations and provenance, with no
dependency on React Grab's runtime entry point.

## Adapter

`mountReactGrabRenderer(root, props)` mounts the upstream UI and returns
`{ update(props), dispose() }`. Inject the exported `styles` into a dedicated
shadow root before mounting. The caller owns stylesheet nonces, theme, and host
lifecycle. Import this bundle only in the browser because the renderer's Solid
event delegation references `document` at module initialization.
