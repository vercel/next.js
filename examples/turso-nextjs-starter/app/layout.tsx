import Navbar from '@/app/components/Navbar'
import FooterComponent from '@/app/components/Footer'
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: {
    template: '%s | Top Web Frameworks',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main className="min-h-screen flex flex-col items-center p-24 mt-10">
          {children}
        </main>
        <FooterComponent />
      </body>
    </html>
  )
}
