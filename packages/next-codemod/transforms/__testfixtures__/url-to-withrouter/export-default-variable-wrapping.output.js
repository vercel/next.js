import { withRouter } from "next/router";
class Test extends React.Component {
  render() {
    const test = this.props.router
  }
}

export default withRouter(wrappingFunction(Test));
