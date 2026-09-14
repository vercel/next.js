/**
 * Import hashbang modules.
 */
import js from '../cases/js.js'
import cjs from '../cases/cjs.cjs'
import mjs from '../cases/mjs.mjs'

const jsMsg = `JS: ${js}`
const mjsMsg = `MJS: ${mjs}`
const cjsMsg = `CJS: ${cjs}`

const Page = () => (
  <div>
    <h3>{jsMsg}</h3>
    <h3>{mjsMsg}</h3>
    <h3>{cjsMsg}</h3>
  </div>
)

export default Page
