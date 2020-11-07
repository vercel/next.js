export default class extends React.Component {
  componentDidUpdate(prevProps) {
    if (prevProps.url.query.f !== this.props.router.query.f) {
      const test = this.props.url
    }
  }
}
