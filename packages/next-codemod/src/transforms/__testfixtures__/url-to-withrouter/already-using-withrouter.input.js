import { withRouter } from 'next/router'

export default withRouter(
  class extends React.Component {
    render() {
      const test = this.props.url
    }
  }
)
