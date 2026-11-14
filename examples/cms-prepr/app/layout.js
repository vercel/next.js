import '@/styles/index.css'
import { SITE_NAME, CMS_NAME } from '@/lib/constants'

export const metadata = {
  title: `${SITE_NAME} with ${CMS_NAME}`,
  description: 'Tips, guides and stories about car leasing.',
  icons: {
    icon: '/favicon/favicon-32x32.png',
    apple: '/favicon/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
