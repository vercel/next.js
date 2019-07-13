import { withRouter, WithRouterProps } from 'next/router'
import * as React from 'react'

interface IWithRouterCompProps extends WithRouterProps<{ page: string }> {}

const WithRouterComp = withRouter(({ router }: IWithRouterCompProps) => {
  const page = parseInt(router.query.page, 10)
  return <div>{page}</div>
})

export default WithRouterComp
