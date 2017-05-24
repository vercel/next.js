import { withRouter } from 'next/router'

function onClickHandler (href, router) {
  return (e) => {
    e.preventDefault()
    router.push(href)
  }
}

const CustomLink = ({ children, href, router }) => (
  <a
    className={router.pathname === href ? 'active' : ''}
    href='#'
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

export default withRouter(CustomLink)
