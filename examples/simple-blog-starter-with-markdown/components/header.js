import Link from 'next/link'
import Container from './container';

export default function Header() {
  return (
    <header className='sticky top-0 center'>
      <Container>
        <h2 className="text-xl py-4 md:text-2xl font-bold tracking-tight md:tracking-tighter leading-tight mb-20 mt-8">
          <Link href="/">
            <a className="hover:underline">Next.js Simple Blog Starter.</a>
          </Link>
        </h2>
      </Container>
    </header>
  )
}
