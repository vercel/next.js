import { Layout } from '../components/layout'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
