import Link from 'next/link';

export default ({ pathname }: { pathname?: any }) => (
  <header>
    <Link href='/'>
      <a className={pathname === '/' ? 'is-active' : ''}>Home</a>
    </Link>
    <Link href='/about'>
      <a className={pathname === '/about' ? 'is-active' : ''}>About</a>
    </Link>
  </header>
);
