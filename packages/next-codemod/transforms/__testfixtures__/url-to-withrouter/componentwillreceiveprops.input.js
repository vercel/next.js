export default class extends React.Component {
  componentWillReceiveProps(nextProps) {
    if (this.props.url.query !== nextProps.url.query) {
      const test = this.props.url
    }
  }
}
