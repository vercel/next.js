import Layout from '../../components/Layout'
import getPayload from '../../payload'

const SiteLayout = async ({ children }: { children: React.ReactNode }) => {
  const payload = await getPayload()

  const mainMenu = await payload.findGlobal({
    slug: 'main-menu',
  })

  return <Layout mainMenu={mainMenu}>{children}</Layout>
}

export default SiteLayout
