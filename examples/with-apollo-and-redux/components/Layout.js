import Nav from './Nav'
import PropTypes from 'prop-types'

const Layout = ({ children }) => (
  <main>
    <Nav />
    {children}
    <style jsx global>{`
      * {
        font-family: Menlo, Monaco, 'Lucida Console', 'Liberation Mono',
          'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New',
          monospace, serif;
      }
      body {
        margin: 0;
        padding: 25px 50px;
      }
      a {
        color: #22bad9;
      }
      p {
        font-size: 14px;
        line-height: 24px;
      }
      article {
        margin: 0 auto;
        max-width: 650px;
      }
      button {
        align-items: center;
        background-color: #22bad9;
        border: 0;
        color: white;
        display: inline-flex;
        padding: 5px 7px;
        margin-right: 1px;
      }
      button:active {
        background-color: #1b9db7;
        transition: background-color 0.3s;
      }
      button:focus {
        outline: none;
      }

      hr {
        height: 1px;
        border: none;
        background: #ececec;
        margin: 20px 0;
      }
    `}</style>
  </main>
)

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
