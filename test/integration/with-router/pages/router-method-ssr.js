import { withRouter } from 'next/router'

function RouterMethodSSR ({ router }) {
  if (typeof window === 'undefined') router.push('/a')
  return <p>Navigating...</p>
}

export default withRouter(RouterMethodSSR)
