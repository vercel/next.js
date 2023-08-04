import { ReactElement } from 'react'
import AuthLayout from '@/layouts/auth/AuthLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import CheckEmailScreen from '@/components/pages/auth/CheckEmailScreen'

const seo = {
  pathname: '/auth/check-email',
  title: {
    ja: 'Emailを確認してください',
    en: 'Check your email',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'auth'], seo)
export { getStaticPaths, getStaticProps }

export default function CheckEmail() {
  return (
    <>
      <CheckEmailScreen />
    </>
  )
}

CheckEmail.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout>{page}</AuthLayout>
}
