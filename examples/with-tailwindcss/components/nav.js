import Link from 'next/link'

const links = [
  { href: 'https://github.com/zeit/next.js', label: 'GitHub' },
  { href: 'https://nextjs.org/docs', label: 'Docs' }
]

export default function Nav () {
  return (
    <nav>
      <ul className='flex justify-between items-center p-8'>
        <li>
          <Link href='/'>
            <a className='text-blue-500 no-underline'>Home</a>
          </Link>
        </li>
        <ul className='flex justify-between items-center'>
          {links.map(({ href, label }) => (
            <li key={`${href}${label}`} className='ml-4'>
              <a href={href} className='btn-blue no-underline'>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </ul>
    </nav>
  )
}
