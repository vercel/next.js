import React from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'

class About extends React.Component {
  static pageTransitionDelayEnter = true

  constructor (props) {
    super(props)
    this.state = {
      loaded: false
    }
  }

  componentDidMount () {
    this.timeoutId = setTimeout(() => {
      this.props.pageTransitionReadyToEnter()
      this.setState({ loaded: true })
    }, 2000)
  }

  componentWillUnmount () {
    if (this.timeoutId) clearTimeout(this.timeoutId)
  }

  render () {
    if (!this.state.loaded) return null
    return (
      <div className='container bg-success page'>
        <h1>About us</h1>
        <p>
          Notice how a loading spinner showed up while my content was "loading"?
          Pretty neat, huh?
        </p>
        <Link href='/'>
          <a className='btn btn-light'>Go back home</a>
        </Link>
      </div>
    )
  }
}

About.propTypes = {
  pageTransitionReadyToEnter: PropTypes.func
}

About.defaultProps = {
  pageTransitionReadyToEnter: () => {}
}

export default About
