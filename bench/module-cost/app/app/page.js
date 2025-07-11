import { Client } from '../../components/client'

import { format, measure } from '../../lib/measure.js'

const COMMONJS = await measure(() => import('../../lib/commonjs.js'))
const ESM = await measure(() => import('../../lib/esm.js'))

export default function Page() {
  return (
    <>
      <h1>Measures the loading time of modules (app router)</h1>
      <p>CommonJs RSC ({format(COMMONJS)})</p>
      <p>ESM RSC ({format(ESM)})</p>
      <Client prefix="/app" />
    </>
  )
}
