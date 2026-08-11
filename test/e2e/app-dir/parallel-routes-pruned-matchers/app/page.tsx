import { ClientNavigation } from './client-navigation'

const navigationPaths = [
  '/named-catchall/anything',
  '/named-only-catchalls/anything',
  '/children-catchall/foo',
  '/children-catchall/bar',
  '/optional-children-catchall',
  '/optional-children-catchall/anything',
  '/split-matcher/anything',
  '/nested-parallel/anything',
  '/grouped/anything',
]

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <ClientNavigation paths={navigationPaths} />
    </>
  )
}
