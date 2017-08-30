import Router, { withRouter } from 'next/router'

// typically you want to use `next/link` for this usecase
// but this example shows how you can also access the router
// and use it manually

const onClickHandler = (href) => (event) => {
  event.preventDefault()
  Router.push(href)
}

const ActiveLink = ({ children, router, href }) => {
  const style = {
    marginRight: 10,
    color: '#000'
  }

  if (router.pathname === href) {
    style.color = 'red'
  }

  return (
    <a href={href} onClick={onClickHandler(href)} style={style}>
      {children}
    </a>
  )
}

export default withRouter(ActiveLink)
