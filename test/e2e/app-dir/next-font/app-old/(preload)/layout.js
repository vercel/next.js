import { font1 } from '../../fonts'

export default function Root({ children }) {
  return (
    <html>
      <head>
        <title>Hello World</title>
      </head>
      <body>
        <p id="root-layout" className={font1.className}>
          {JSON.stringify(font1)}
        </p>
        {children}
      </body>
    </html>
  )
}
