/* eslint-disable-next-line */
import Router from 'next/router'

function routerDirect(props) {
  return <div>I import the router directly</div>
}

routerDirect.getInitialProps = () => ({})

export default routerDirect
