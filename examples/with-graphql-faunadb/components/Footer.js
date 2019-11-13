import {
  footer,
  footerContent,
  footerColumn,
  footerColumnFirst,
  footerColumnFirstURL,
  footerColumnList,
  footerColumnListURL,
} from '../styles/footer.js'

export default props => (
  <footer className={footer.className}>
    <div className={footerContent.className}>
      <div
        className={`${footerColumn.className} ${footerColumnFirst.className}`}
      >
        <a href="https://fauna.com" target="_blank">
          <img src="/static/fauna-logo-white.png" height="35px" width="auto" />
        </a>
        <p>
          744 Montgomery Street
          <br />
          Suite 200
          <br />
          San Francisco, CA 94111
          <br />
          <a
            href="mailto:info@fauna.com"
            className={footerColumnFirstURL.className}
          >
            info@fauna.com
          </a>
        </p>
      </div>
      <div className={footerColumn.className}>
        Fauna
        <ul className={footerColumnList.className}>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/faunadb"
            >
              FaunaDB
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/pricing"
            >
              Pricing
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/resources"
            >
              Resources
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/blog"
            >
              Blog
            </a>
          </li>
        </ul>
      </div>
      <div className={footerColumn.className}>
        About
        <ul className={footerColumnList.className}>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/team"
            >
              Company
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/press"
            >
              Press
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://fauna.com/careers"
            >
              Careers
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="http://www2.fauna.com/contact-us"
            >
              Contact
            </a>
          </li>
        </ul>
      </div>
      <div className={footerColumn.className}>
        Quicklinks
        <ul className={footerColumnList.className}>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://community-invite.fauna.com/"
            >
              Community Slack
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://support.fauna.com/"
            >
              Support
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://dashboard.fauna.com/"
            >
              Login
            </a>
          </li>
          <li>
            <a
              className={footerColumnListURL.className}
              target="_blank"
              href="https://dashboard.fauna.com/accounts/register"
            >
              Signup
            </a>
          </li>
        </ul>
      </div>
    </div>
    {footerColumnListURL.styles}
    {footerColumnList.styles}
    {footerColumnFirstURL.styles}
    {footerColumnFirst.styles}
    {footerColumn.styles}
    {footerContent.styles}
    {footer.styles}
  </footer>
)
