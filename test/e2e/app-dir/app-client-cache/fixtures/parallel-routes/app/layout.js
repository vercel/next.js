import { RouterAct } from '@next/router-act/component'

export default function Root({ children, breadcrumbs }) {
  return (
    <html>
      <head></head>
      <body>
        <RouterAct />
        <div>{breadcrumbs}</div>
        <div id="root-layout">Root Layout</div>
        <div>{children}</div>
      </body>
    </html>
  )
}
