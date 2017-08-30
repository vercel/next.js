import Router, { withRoute } from 'next/router'

// typically you want to use `next/link` for this usecase
// but this example shows how you can also access the router
// and use it manually

const onClickHandler = (href) => (event) => {
  event.preventDefault()
  Router.push(href)
}

const ActiveLink = ({ children, route, href }) => {
  const active = route.pathname === href
  const className = active ? 'active' : ''
  return (
    <a href='#' onClick={onClickHandler(href)} className={className}>
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

export default withRoute(ActiveLink)
