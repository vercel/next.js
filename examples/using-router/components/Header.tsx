import { useRouter } from 'next/router'

export default function Header() {
  return (
    <div>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
    </div>
  )
}

type LinkProps = {
  children: React.ReactNode
  href: string
}

function Link({ children, href }: LinkProps) {
  const router = useRouter()

  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        // typically you want to use `next/link` for this usecase
        // but this example shows how you can also access the router
        // and use it manually
        router.push(href)
      }}
    >
      {children}
      <style jsx>{`
        a {
          margin-right: 10px;
        }
      `}</style>
    </a>
  )
}
