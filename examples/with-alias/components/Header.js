import Link from 'next/link';

export default () => (
  <div>
    <Link href="/">
      <a style={{marginRight: 10}}>Home</a>
    </Link>
    <Link href="/about">
      <a>About</a>
    </Link>
  </div>
);
