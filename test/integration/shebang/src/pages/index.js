/**
 * Import shebang-y modules.
 */
import js from '../cases/jsWithShebang.js'
import cjs from '../cases/cjsWithShebang.cjs'
// import mjs from '../cases/mjsWithShebang.mjs'

const jsMsg = `JS: ${js}`
// const mjsMsg = `MJS: ${mjs}`
const cjsMsg = `CJS: ${cjs}`

const Page = () => (
  <div>
    <h3>{jsMsg}</h3>
    {/* <h3>{mjsMsg}</h3> */}
    <h3>{cjsMsg}</h3>
  </div>
)

export default Page
