import DynamicComponents from '../ui/dynamic-components'
import SsrTarget from '../ui/ssr-target'
import ClientTarget from '../ui/client-target'

// The client module with the next/dynamic imports is also rendered by the root
// layout, and the page statically imports the dynamic targets. The module, and
// the async loaders of its next/dynamic imports, are chunked with the layout.
export default function Page() {
  return (
    <main>
      <SsrTarget />
      <ClientTarget />
      <DynamicComponents />
    </main>
  )
}
