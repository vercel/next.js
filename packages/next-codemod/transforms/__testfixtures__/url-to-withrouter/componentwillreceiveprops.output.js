import { withRouter } from 'next/router'

export default withRouter(
  class extends React.Component {
    componentWillReceiveProps(nextProps) {
      if (this.props.router.query !== nextProps.router.query) {
        const test = this.props.router
      }
    }
  }
)
