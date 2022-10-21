import { withRouter } from 'next/router'

export default withRouter(
  class Something extends React.Component {
    render() {
      const { props, stats } = this

      const test = props.router
    }
  }
)
