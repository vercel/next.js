import { RootLayoutTimestamp } from '../../shared'

export default async function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <RootLayoutTimestamp />
        <hr />
        {children}
      </body>
    </html>
  )
}
