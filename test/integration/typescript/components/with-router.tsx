import { withRouter } from 'next/router'

export default withRouter(({ router }) => {
  return <>{router.pathname}</>
})
