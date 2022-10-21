import { withRouter } from "next/router";

export default withRouter(class extends React.Component {
  componentDidUpdate(prevProps) {
    if (prevProps.router.query.f !== this.props.router.query.f) {
      const test = this.props.router
    }
  }
});
