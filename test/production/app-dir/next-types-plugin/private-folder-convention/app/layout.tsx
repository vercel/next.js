import { PrivateLayout } from './_private/layout'
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <PrivateLayout>{children}</PrivateLayout>
      </body>
    </html>
  )
}
