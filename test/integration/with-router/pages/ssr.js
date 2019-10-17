import * as React from 'react'
import { withRouter } from 'next/router'

export default withRouter(function SSR ({ router }) {
  return <span>{`Pathname: ${router.pathname}`}</span>
})
