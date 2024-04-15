import Router from 'next/router'

const Page = () => <p>This is the page</p>

Page.getInitialProps = (ctx) => {
  if (ctx.res) {
    ctx.res.writeHead(302, { Location: '/nav/about' })
    ctx.res.end()
  } else {
    Router.push('/nav/about')
  }

  return {}
}

export default Page
