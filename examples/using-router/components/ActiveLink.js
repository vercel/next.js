import Router, { withRouter } from 'next/router'

// typically you want to use `next/link` for this usecase
// but this example shows how you can also access the router
// and use it manually

const onClickHandler = (href) => (event) => {
  event.preventDefault()
  Router.push(href)
}

const ActiveLink = ({ children, router, href }) => {
  const active = router.pathname === href
  const className = active ? 'active' : ''
  return (
    <a href={href} onClick={onClickHandler(href)} className={className}>
      {children}
      <style jsx>{`
        a {
          margin-right: 10px;
        }

        .active {
          color: red;
        }
      `}</style>
    </a>
  )
}

export default withRouter(ActiveLink)
