import { layoutAction } from './actions'

export default function Layout({ children }) {
  return (
    <html>
      <nav>
        <div>
          <h3>layout.js form</h3>
          <form>
            <input type="text" placeholder="input" />
            <button formAction={layoutAction}>submit</button>
          </form>
        </div>
      </nav>

      <body>{children}</body>
    </html>
  )
}
