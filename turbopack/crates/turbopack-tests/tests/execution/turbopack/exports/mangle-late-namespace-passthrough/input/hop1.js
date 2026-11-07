import { readLate as readFromHop2 } from './hop2'

// Real code (not a re-export) so this hop stays in the graph and the namespace read in
// `provider.js` is reached later than the direct named import in `index.js`.
export function readLate() {
  return readFromHop2()
}
