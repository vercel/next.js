import { withRouter } from 'next/router'

export default withRouter(class extends React.Component {
  onClick = e => {
    const { router } = this.props
    
    router.replace('/url/href')
  }
  render() {
    return (
      <button onClick={this.onClick}>
        Test
      </button>
    )
  }
})
