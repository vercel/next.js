export default function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

export const metadata = {
  title: 'Root Layout',
  description: 'Root Description',
}
