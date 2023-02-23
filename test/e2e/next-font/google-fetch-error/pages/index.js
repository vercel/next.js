import { Inter } from 'next/font/google'
const inter = Inter({ weight: '400', subsets: ['latin'] })

export default function Page() {
  return (
    <p id="inter-fallback" className={inter.className}>
      {JSON.stringify(inter)}
    </p>
  )
}
