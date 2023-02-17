import { redirect } from 'next/navigation'
export default function Root({ children }: { children: React.ReactNode }) {
  redirect('/result')
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
