import { NoInline } from '../../components/no-inline'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NoInline />
      Static content in layout of dynamic page
      <div>{children}</div>
    </div>
  )
}
