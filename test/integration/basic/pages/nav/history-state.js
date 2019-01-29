import Link from 'next/link'
import { withRouter } from 'next/router'

const linkStyle = {
  marginRight: 10
}

export default withRouter(({router}) => {
  const increase = () => {
    const current = window.history.state &&
      window.history.state.options.state
    const href = `/nav/history-state?i=${current}`

    router.push(href, href, { state: (current || 0) + 1 })
  }

  const getCount = () => {
    if (typeof window !== 'undefined') {
      return window.history.state &&
        window.history.state.options.state
    }
  }

  return (
    <div className='history-state'>
      <Link href='/nav'><a id='home-link' style={linkStyle}>Home</a></Link>
      <div id='counter'>
        Counter: {getCount()}
      </div>
      <button id='increase' onClick={() => increase()}>Increase</button>
    </div>
  )
})
