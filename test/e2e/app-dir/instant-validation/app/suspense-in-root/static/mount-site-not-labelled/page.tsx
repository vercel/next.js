import { AppSideBar } from './app-sidebar'

export const instant = { level: 'experimental-error' }

// The runtime data access lives in dynamic-breadcrumb.tsx (throw site), mounted
// by app-sidebar.tsx (mount site). The dev-overlay call stack contains both
// frames but does not label which is which, so a reader following "wrap the
// data access in <Suspense>" edits the throw site instead of the mount site.
export default function Page() {
  return (
    <main>
      <AppSideBar />
    </main>
  )
}
