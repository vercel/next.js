import { withRouter } from 'next/router'

export default withRouter(class extends React.Component {
  onClick = id => {
    const { router } = this.props
    
    router.replace(`/url/${id}`)
  }
  render() {
    return (
      <button onClick={() => this.onClick('123')}>
        Test
      </button>
    )
  }
})
