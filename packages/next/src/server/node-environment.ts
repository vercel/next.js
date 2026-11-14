// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

import './node-environment-baseline'
// Import as early as possible so that unexpected errors in other extensions are properly formatted.
// Has to come after baseline since error-inspect requires AsyncLocalStorage that baseline provides.
import './node-environment-extensions/error-inspect'

// console file needs to go first because we want to be in a dimmed scope before
// deciding if we ought to write the log to file.
import './node-environment-extensions/console-file'
import './node-environment-extensions/console-exit'
import './node-environment-extensions/console-dim.external'

import './node-environment-extensions/unhandled-rejection.external'
import './node-environment-extensions/random'
import './node-environment-extensions/date'
import './node-environment-extensions/web-crypto'
import './node-environment-extensions/node-crypto'
import './node-environment-extensions/fast-set-immediate.external'

// When a pre-compiled bundle already ran its own copy of the extensions
// above, `build/adapter/setup-node-env.external` finds this mark and does not
// run them a second time from this file. It runs only `console-exit` again,
// which wraps the console methods as they are at that point: the
// instrumentation hook may have replaced them since. A new extension that
// has to see what the hook did needs the same `require` there.
;(globalThis as Record<symbol, unknown>)[
  Symbol.for('next.server.node-environment')
] = true
