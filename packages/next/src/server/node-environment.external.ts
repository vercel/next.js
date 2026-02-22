// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

import './node-environment-baseline.external'
// Import as early as possible so that unexpected errors in other extensions are properly formatted.
// Has to come after baseline since error-inspect requires AsyncLocalStorage that baseline provides.
import './node-environment-extensions/error-inspect.external'

// console file needs to go first because we want to be in a dimmed scope before
// deciding if we ought to write the log to file.
import './node-environment-extensions/console-file.external'
import './node-environment-extensions/console-exit.external'
import './node-environment-extensions/console-dim.external'

import './node-environment-extensions/unhandled-rejection.external'
import './node-environment-extensions/random.external'
import './node-environment-extensions/date.external'
import './node-environment-extensions/web-crypto.external'
import './node-environment-extensions/node-crypto.external'
import './node-environment-extensions/fast-set-immediate.external'
