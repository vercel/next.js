import { withRouter } from 'next/router'

export default withRouter(class extends React.Component {
  onClick = e => {
    this.props.router.push('/url/as', '/url/href')
  }
  render() {
    return (
      <button onClick={this.onClick}>
        Test
      </button>
    )
  }
})
