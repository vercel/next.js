import { withRouter } from 'next/router'

export default withRouter(
  withAppContainer(
    withAuth((props) => {
      const test = props.router
    })
  )
)
