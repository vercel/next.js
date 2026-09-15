import addon from 'single-context-addon'

// `CONTEXT_AWARE` comes from the compiled binary, so rendering it proves the addon
// really loaded rather than resolving to an empty module.
export default function Page() {
  return <p id="context-aware">{String(addon.CONTEXT_AWARE)}</p>
}
