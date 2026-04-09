import { HTTPAccessErrorFallback } from '../http-access-fallback/error-fallback'

function GlobalNotFound() {
  return (
    <html>
      <body>
        <HTTPAccessErrorFallback
          status={404}
          message={'This page could not be found.'}
        />
      </body>
    </html>
  )
}

export default GlobalNotFound
