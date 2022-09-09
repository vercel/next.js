import { useRouter, withRouter } from 'next/router'
import IsNull from './IsNull'

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
