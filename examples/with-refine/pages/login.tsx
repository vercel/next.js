import { AuthPage } from '@refinedev/antd'
import { ExtendedNextPage } from './_app'

const Page: ExtendedNextPage = () => {
  return (
    <AuthPage
      type="login"
      formProps={{
        initialValues: {
          email: 'admin@refine.dev',
          password: 'password',
        },
      }}
    />
  )
}

Page.noLayout = true

export default Page
