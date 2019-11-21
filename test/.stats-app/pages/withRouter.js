import { withRouter } from 'next/router'

function useWithRouter(props) {
  return <div>I use withRouter</div>
}

useWithRouter.getInitialProps = () => ({})

export default withRouter(useWithRouter)
