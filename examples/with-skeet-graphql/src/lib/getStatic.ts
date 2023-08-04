import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import i18nextConfig from '../../next-i18next.config'
import { GetStaticPropsContext } from 'next'
import siteConfig from '@/config/site'

type Seo = {
  pathname: string
  title: {
    ja: string
    en: string
  }
  description: {
    ja: string
    en: string
  }
  img: string | null
}

export type SeoData = {
  property?: string
  name?: string
  content?: string
}

export const getI18nPaths = () =>
  i18nextConfig.i18n.locales.map((lng) => ({
    params: {
      locale: lng,
    },
  }))

export const getStaticPaths = () => ({
  fallback: false,
  paths: getI18nPaths(),
})

export async function getI18nProps(
  ctx: GetStaticPropsContext,
  ns = ['common'],
  seo: Seo
) {
  const locale = ctx?.params?.locale as 'ja' | 'en'

  const { pathname, img } = seo
  const title = seo.title[locale]
  const description = seo.description[locale]
  const siteName =
    locale === 'ja' ? siteConfig.sitenameJA : siteConfig.sitenameEN

  const ogImage = img
    ? `https://${siteConfig.domain}${img}`
    : `https://${siteConfig.domain}/ogp.png`

  const seoData: SeoData[] = [
    { property: 'og:title', content: `${title} | ${siteName}` },
    { name: 'twitter:title', content: `${title} | ${siteName}` },
    { name: 'twitter:text:title', content: `${title} | ${siteName}` },
    { name: 'description', content: `${description}` },
    { property: 'og:description', content: `${description}` },
    { name: 'twitter:description', content: `${description}` },
    {
      property: 'og:url',
      content: `https://${siteConfig.domain}/${locale}${pathname}`,
    },
    { property: 'og:image', content: ogImage },
    { property: 'og:image:secure', content: ogImage },
    { name: 'twitter:image', content: ogImage },
  ]

  const props = {
    title: `${title} | ${siteName}`,
    seoData,
    ...(await serverSideTranslations(locale, ns)),
  }
  return props
}

export function makeStaticProps(ns: string[] = [], seo: Seo) {
  return async function getStaticProps(ctx: GetStaticPropsContext) {
    return {
      props: await getI18nProps(ctx, ns, seo),
    }
  }
}
