// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

import './node-environment-baseline'
// Import as early as possible so that unexpected errors in other extensions are properly formatted.
// Has to come after baseline since error-inspect requires AsyncLocalStorage that baseline provides.
import './node-environment-extensions/error-inspect'
import './node-environment-extensions/random'
import './node-environment-extensions/date'
import './node-environment-extensions/web-crypto'
import './node-environment-extensions/node-crypto'
