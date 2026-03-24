export default function Page() {
  let missing = null
  try {
    missing = require('a-missing-module-for-server-warning-testing')
  } catch (e) {
    // expected
  }
  return <p>server warning page {String(missing)}</p>
}
