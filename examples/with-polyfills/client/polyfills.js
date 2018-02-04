/* eslint no-extend-native: 0 */

// Add your polyfills
// This files runs at the very beginning (even before React and Next.js core)

console.log('Load your polyfills')

// core-js comes with Next.js. So, you can import it like below
import includes from 'core-js/library/fn/string/virtual/includes'
import repeat from 'core-js/library/fn/string/virtual/repeat'

String.prototype.includes = includes
String.prototype.repeat = repeat
