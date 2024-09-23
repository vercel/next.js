import { withRouter } from "next/router";

export default withRouter(withSomethingElse(class extends React.Component {
  render() {
    const test = this.props.router
  }
}));
