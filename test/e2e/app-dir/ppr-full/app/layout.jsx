import { Layout } from '../components/layout'

export default ({ children }) => {
  return (
    <html>
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
