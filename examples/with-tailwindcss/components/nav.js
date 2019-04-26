import Link from 'next/link'

const links = [
  { href: 'https://github.com/zeit/next.js', label: 'GitHub' },
  { href: 'https://nextjs.org/docs', label: 'Docs' }
]

export default function Nav () {
  return (
    <nav>
      <ul className='flex justify-between items-center p-8'>
        <li className='list-reset'>
          <Link prefetch href='/'>
            <a className='text-blue no-underline'>Home</a>
          </Link>
        </li>
        <ul className='flex justify-between items-center'>
          {links.map(({ href, label }) => (
            <li key={`${href}${label}`} className='list-reset ml-4'>
              <Link href={href}>
                <a className='btn-blue no-underline'>{label}</a>
              </Link>
            </li>
          ))}
        </ul>
      </ul>
    </nav>
  )
}
