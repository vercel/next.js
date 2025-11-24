import { Client } from '../../components/client'

import { measure } from '../../lib/measure.js'

const commonjsAction = async () => {
  'use server'
  return await measure(
    'app rsc commonjs',
    () => import('../../lib/commonjs.js')
  )
}

const esmAction = async () => {
  'use server'
  return await measure('app rsc esm', () => import('../../lib/esm.js'))
}

export default function Page() {
  return (
    <>
      <h1>Measures the loading time of modules (app router)</h1>
      <Client
        prefix="/app"
        commonjsAction={commonjsAction}
        esmAction={esmAction}
      />
    </>
  )
}
