import { ReactElement, useMemo } from 'react'

import ResetPasswordAction from '@/components/pages/action/ResetPasswordAction'
import VerifyEmailAction from '@/components/pages/action/VerifyEmailAction'
import InvalidParamsError from '@/components/error/InvalidParamsError'
import { useRouter } from 'next/router'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import ActionLayout from '@/layouts/action/ActionLayout'

const seo = {
  pathname: '/action',
  title: {
    ja: 'アクション',
    en: 'Action',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

export default function Action() {
  const router = useRouter()
  const mode = useMemo(
    () => (router.query.mode as string) ?? undefined,
    [router]
  )
  const oobCode = useMemo(
    () => (router.query.oobCode as string) ?? undefined,
    [router]
  )

  if (!mode || !oobCode) {
    return <InvalidParamsError />
  }

  if (mode !== 'resetPassword' && mode !== 'verifyEmail') {
    return <InvalidParamsError />
  }

  return (
    <>
      {mode === 'resetPassword' && <ResetPasswordAction oobCode={oobCode} />}
      {mode === 'verifyEmail' && <VerifyEmailAction oobCode={oobCode} />}
    </>
  )
}

const getStaticProps = makeStaticProps(['common', 'auth'], seo)
export { getStaticPaths, getStaticProps }

Action.getLayout = function getLayout(page: ReactElement) {
  return <ActionLayout>{page}</ActionLayout>
}
