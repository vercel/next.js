import { withRouter } from 'next/router'

const Link = withRouter(({ router, children, href }) => {
  const handleClick = (e) => {
    e.preventDefault()
    router.push(href)
  }

  return (
    <div>
      <span id='pathname'>Current path: {router.pathname}</span>
      <span id='asPath'>Current asPath: {router.asPath}</span>
      <a href='#' onClick={handleClick}>{children}</a>
    </div>
  )
})

export default () => (
  <div className='nav-with-hoc'>
    <Link href='/nav'>Go Back</Link>
    <p>This is the about page.</p>
  </div>
)
