/* eslint-disable-next-line */
import Router from 'next/router'

function routerDirect(props) {
  return <div>I import the router directly</div>
}

// we add getServerSideProps to prevent static optimization
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default routerDirect
