import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/about">
      <a href="/about" className="some-class">Link</a>
    </Link>
  );
}
