import { withRouter } from 'next/router'

const onClickHandler = (href, router) => (event) => {
  event.preventDefault()
  router.push(href)
}

const ActiveLink = ({ children, href, router }) => (
  <a
    className={router.pathname === href ? 'active' : ''}
    // event.preventDefault() stops the link from working normally,
    // but we still pass href in so that the user can see the URL
    // on hover
    href={href}
    onClick={onClickHandler(href, router)}
  >
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

export default withRouter()(ActiveLink)
