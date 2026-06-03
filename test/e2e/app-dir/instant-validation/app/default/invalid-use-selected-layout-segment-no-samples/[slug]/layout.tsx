import { ActiveTab } from './active-tab'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ActiveTab />
      {children}
    </div>
  )
}
