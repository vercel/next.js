import { AuthPage } from '@refinedev/antd'
import { ExtendedNextPage } from './_app'

const Page: ExtendedNextPage = () => {
  return <AuthPage type="forgotPassword" />
}

Page.noLayout = true

export default Page
