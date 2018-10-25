import * as React from 'react'
import Router from 'next/router'

class PageC extends React.Component {
  componenntWillUnmount () {
    Router.beforeRouteChangeStart(() => true)
  }

  goToBFalse () {
    Router.beforeRouteChangeStart(() => false)
    return Router.push('/b')
  }

  goToBTrue () {
    Router.beforeRouteChangeStart(() => true)
    return Router.push('/b')
  }

  render () {
    return (
      <div id='page-c'>
        <button className='false' onClick={() => this.goToBFalse()}>Go to B</button>
        <button className='true' onClick={() => this.goToBTrue()}>Go to B</button>
      </div>
    )
  }
}

export default PageC
