import { Bitter } from 'next/font/google'

const bitter = Bitter({ weight: '400', subsets: ['latin'] })

export default function Page() {
  return (
    <p id="bitter" className={bitter.className}>
      {JSON.stringify(bitter)}
    </p>
  )
}
