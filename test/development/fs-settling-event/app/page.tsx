// Importing this package makes Turbopack read (and therefore watch) the file
// inside `node_modules`, so the writes the test performs generate watcher
// events. This matters on Linux, where the watcher is non-recursive and only
// watches directories it has been asked to read.
import counter from 'fs-settling-fixture-pkg'

export default function Page() {
  return <p>counter: {counter}</p>
}
