import { ReactElement } from 'react'
import UserLayout from '@/layouts/user/UserLayout'
import siteConfig from '@/config/site'
import { getStaticPaths, makeStaticProps } from '@/lib/getStatic'
import SettingsScreen from '@/components/pages/user/settings/SettingsScreen'

const seo = {
  pathname: '/user/settings',
  title: {
    ja: 'ユーザー設定',
    en: 'User Settings',
  },
  description: {
    ja: siteConfig.descriptionJA,
    en: siteConfig.descriptionEN,
  },
  img: null,
}

const getStaticProps = makeStaticProps(['common', 'user', 'settings'], seo)
export { getStaticPaths, getStaticProps }

export default function Settings() {
  return (
    <>
      <SettingsScreen />
    </>
  )
}

Settings.getLayout = function getLayout(page: ReactElement) {
  return <UserLayout>{page}</UserLayout>
}
