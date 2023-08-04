import { ReactElement } from 'react'
import AuthLayout from '@/layouts/auth/AuthLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import LoginScreen from '@/components/pages/auth/LoginScreen'

const seo = {
  pathname: '/auth/login',
  title: {
    ja: 'ログイン',
    en: 'Sign in',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'auth'], seo)
export { getStaticPaths, getStaticProps }

export default function Login() {
  return (
    <>
      <LoginScreen />
    </>
  )
}

Login.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout>{page}</AuthLayout>
}
