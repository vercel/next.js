'use client'
import './global.css'
export default function Root({
  children,
  audience,
}: {
  children: React.ReactNode
  audience: React.ReactNode
}) {
  return (
    <html>
      <body>
        <fieldset>
          <legend>app/layout</legend>
          {children}
          {audience}
        </fieldset>
      </body>
    </html>
  )
}
