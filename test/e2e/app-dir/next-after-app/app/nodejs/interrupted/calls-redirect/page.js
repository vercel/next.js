import { after, connection } from 'next/server'
import { redirect } from 'next/navigation'
import { cliLog } from '../../../../utils/log'

// NOTE: this page is forked in /edge

export function createPage(pathPrefix) {
  return async function Page() {
    await connection()
    after(() => {
      cliLog({
        source: '[page] /interrupted/calls-redirect',
      })
    })

    redirect(pathPrefix + '/interrupted/redirect-target')
  }
}

export default createPage('/nodejs')
