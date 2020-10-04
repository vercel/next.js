const fetch = require('isomorphic-unfetch')
const React = require('react')

export default class extends React.Component {
  static async getInitialProps() {
    try {
      const res = await fetch('')
      const text = await res.text()
      console.log(text)
      return { text }
    } catch (err) {
      if (err.message.includes('is not a function')) {
        return { failed: true, error: err.toString() }
      }

      return { error: err.toString() }
    }
  }
  render() {
    const { failed, error, text } = this.props
    return (
      <div className="fetch-cjs-page">
        {failed ? 'failed' : ''}
        {error}
        <div id="text">{text}</div>
      </div>
    )
  }
}
