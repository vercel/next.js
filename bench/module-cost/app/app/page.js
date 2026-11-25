import { Client } from '../../components/client'

import { deferCases } from '../../lib/defer-cases.js'
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

const deferAction = async (name) => {
  'use server'
  return await measure(`app rsc ${name}`, deferCases[name])
}

export default function Page() {
  return (
    <>
      <h1>Measures the loading time of modules (app router)</h1>
      <Client
        prefix="/app"
        commonjsAction={commonjsAction}
        esmAction={esmAction}
        deferAction={deferAction}
      />
    </>
  )
}
