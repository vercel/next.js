export default class Page {
  static async getInitialProps() {
    return {
      prop: true,
    }
  }

  render() {
    return <div />
  }
}
