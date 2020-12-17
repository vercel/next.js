import Router from 'next/router'

export default class extends React.Component {
  onClick = e => {
    Router.replace('/url/href')
  }
  render() {
    return (
      <button onClick={this.onClick}>
        Test
      </button>
    )
  }
}
