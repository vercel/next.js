import { MyPage } from './blog/_components/page'
import { MyLayout } from './blog/_components/layout'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <MyLayout />
        <MyPage />
      </body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
