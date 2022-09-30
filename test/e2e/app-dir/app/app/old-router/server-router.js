import { useRouter, withRouter } from 'next/router'
import IsNull from './is-null'

function ServerRouter({ router: withRouter }) {
  const router = useRouter()

  return (
    <>
      <IsNull value={withRouter} />
      <IsNull value={router} />
    </>
  )
}

export default withRouter(ServerRouter)
