import { AuthPage } from '@refinedev/antd'
import { ExtendedNextPage } from './_app'

const Page: ExtendedNextPage = () => {
  return <AuthPage type="updatePassword" />
}

Page.noLayout = true

export default Page
