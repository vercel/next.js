import { withRouter } from 'next/router'

export default withRouter(class extends React.Component {
  onClick = id => {
    this.props.router.push(`/url/${id}`)
  }
  render() {
    return (
      <button onClick={() => this.onClick('123')}>
        Test 123
      </button>
    )
  }
})
