import { RouterAct } from '@next/router-act/component'

export default function Root({ children }) {
  return (
    <html>
      <head>
        <title>Hello World</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `if (location.search.includes('bot')) {
              Object.defineProperty(navigator, 'userAgent', {
                value: new URLSearchParams(location.search).get("useragent"),
              });
            }`,
          }}
        />
      </head>
      <body>
        <RouterAct />
        {children}
      </body>
    </html>
  )
}
