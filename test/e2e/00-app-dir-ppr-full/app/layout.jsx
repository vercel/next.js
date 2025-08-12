import { Links } from '../components/links'

export default ({ children }) => {
  return (
    <html>
      <body>
        <h1>Partial Prerendering</h1>
        <p>
          Below are links that are associated with different pages that all will
          partially prerender
        </p>
        <aside>
          <Links />
        </aside>
        <main>{children}</main>
      </body>
    </html>
  )
}
