import { AuthPage } from '@refinedev/antd'
import { ExtendedNextPage } from './_app'

const Page: ExtendedNextPage = () => {
  return <AuthPage type="register" />
}

Page.noLayout = true

export default Page
