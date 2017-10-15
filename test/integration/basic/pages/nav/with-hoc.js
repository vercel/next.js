import { withRouter } from 'next/router'

const Link = withRouter(({router, children, href}) => {
  const handleClick = (e) => {
    e.preventDefault()
    router.push(href)
  }

  return (
    <div>
      <span>Current path: {router.pathname}</span>
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
