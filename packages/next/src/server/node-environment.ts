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

import './node-environment-extensions/unhandled-rejection'
import './node-environment-extensions/random'
import './node-environment-extensions/date'
import './node-environment-extensions/web-crypto'
import './node-environment-extensions/node-crypto'
