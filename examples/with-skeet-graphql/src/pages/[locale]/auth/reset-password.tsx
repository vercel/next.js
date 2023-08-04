import { ReactElement } from 'react'
import AuthLayout from '@/layouts/auth/AuthLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import ResetPasswordScreen from '@/components/pages/auth/ResetPasswordScreen'

const seo = {
  pathname: '/auth/reset-password',
  title: {
    ja: 'パスワードリセット',
    en: 'Reset your password',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'auth'], seo)
export { getStaticPaths, getStaticProps }

export default function ResetPassword() {
  return (
    <>
      <ResetPasswordScreen />
    </>
  )
}

ResetPassword.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout>{page}</AuthLayout>
}
