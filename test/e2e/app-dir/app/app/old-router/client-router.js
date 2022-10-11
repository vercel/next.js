'use client'

import { useRouter, withRouter } from 'next/router'
import IsNull from './is-null'

function ClientRouter({ router: withRouter }) {
  const router = useRouter()

  return (
    <>
      <IsNull value={withRouter} />
      <IsNull value={router} />
    </>
  )
}

export default withRouter(ClientRouter)
