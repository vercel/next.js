import { DynamicBreadcrumb } from './dynamic-breadcrumb'

// Mount site: <DynamicBreadcrumb /> is rendered here with no <Suspense> around
// it. THIS is where the fix goes — but the dev-overlay call stack lists this
// frame identically to the throw site, with nothing marking it as the mount
// site / where the <Suspense> boundary belongs.
export function AppSideBar() {
  return (
    <aside>
      <h2>Sidebar</h2>
      <DynamicBreadcrumb />
    </aside>
  )
}
