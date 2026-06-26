import { Client } from './client'
import './global.css'
import './global-not-found.css'

export default function GlobalNotFound() {
  return (
    // html tag is different from actual page's layout
    <html data-global-not-found="true">
      <body>
        <h1 id="global-error-title">global-not-found</h1>
        <Client />
        <p className="orange-text">orange text (from global.css)</p>
        <p className="blue-text">blue text (from global-not-found.css)</p>
      </body>
    </html>
  )
}
