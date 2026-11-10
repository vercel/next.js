import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function getLocaleConfig(localeParam: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 800))
  return {
    locale: localeParam,
    translations: {
      home: `Home (${localeParam})`,
      blog: `Blog (${localeParam})`,
      about: `About (${localeParam})`,
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  return (
    <html>
      <body>
        <div id="static-header">Welcome to our Blog Platform</div>
        <nav id="static-nav">
          <ul>
            <li>Home</li>
            <li>Blog</li>
            <li>About</li>
          </ul>
        </nav>

        <Suspense
          fallback={<div id="locale-loading">Loading locale info...</div>}
        >
          <LocaleInfo params={params} />
        </Suspense>

        <Suspense fallback={<div id="dynamic-loading">Loading user...</div>}>
          <UserInfo />
        </Suspense>

        {children}
      </body>
    </html>
  )
}

// This component depends on locale, so it's in Suspense
async function LocaleInfo({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const config = await getLocaleConfig(locale)

  return (
    <header id="locale-header">
      <span>Locale: {config.locale}</span>
      <div id="translations">
        {config.translations.home} | {config.translations.blog} |{' '}
        {config.translations.about}
      </div>
    </header>
  )
}

async function UserInfo() {
  const cookieStore = await cookies()
  const user = cookieStore.get('user')?.value || 'anonymous'
  return <div id="user-info">Logged in as: {user}</div>
}

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'fr' }]
}
