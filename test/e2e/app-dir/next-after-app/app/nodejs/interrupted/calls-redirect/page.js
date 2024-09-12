import { unstable_after as after } from 'next/server'
import { redirect } from 'next/navigation'
import { cliLog } from '../../../../utils/log'

// NOTE: this page is forked in /edge

export function createPage(pathPrefix) {
  return function Page() {
    after(() => {
      cliLog({
        source: '[page] /interrupted/calls-redirect',
      })
    })

    redirect(pathPrefix + '/interrupted/redirect-target')
  }
}

export default createPage('/nodejs')
