import { ReactElement } from 'react'
import AuthLayout from '@/layouts/auth/AuthLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import RegisterScreen from '@/components/pages/auth/RegisterScreen'

const seo = {
  pathname: '/auth/register',
  title: {
    ja: 'アカウント登録',
    en: 'Register an account',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'auth'], seo)
export { getStaticPaths, getStaticProps }

export default function Register() {
  return (
    <>
      <RegisterScreen />
    </>
  )
}

Register.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout>{page}</AuthLayout>
}
