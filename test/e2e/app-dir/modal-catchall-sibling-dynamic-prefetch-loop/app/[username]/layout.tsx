import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

// Params are read inside Suspense throughout this fixture so the routes can
// be prerendered when Cache Components is enabled (CI runs every suite with
// __NEXT_CACHE_COMPONENTS=true).
async function UserHeading({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return <h1 id="user-layout-heading">{username}</h1>
}

export default function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ username: string }>
}) {
  return (
    <div>
      <header>
        <Suspense fallback={null}>
          <UserHeading params={params} />
        </Suspense>
        <LinkAccordion href="/viewer">my profile</LinkAccordion>
      </header>
      {children}
    </div>
  )
}
