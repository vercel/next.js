import { headerBanner, headerTitle } from '../styles/header'

export default props => (
  <>
    <a href="https://fauna.com" target="_blank" rel="noopener noreferrer">
      <img
        className={headerBanner.className}
        src="/static/fauna-logo-blue.png"
        height="35px"
        width="auto"
      />
    </a>
    <h1 className={headerTitle.className}>Guestbook</h1>
    {headerBanner.styles}
    {headerTitle.styles}
  </>
)
