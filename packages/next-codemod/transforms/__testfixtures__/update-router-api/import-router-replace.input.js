import Router from 'next/router'

export default class extends React.Component {
  onClick = id => {
    Router.replace('/url/[id]', `/url/${id}`)
  }
  render() {
    return (
      <button onClick={() => this.onClick('123')}>
        Test
      </button>
    )
  }
}
