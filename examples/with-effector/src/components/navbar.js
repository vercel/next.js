import Link from "next/link";

export const Navbar = () => (
  <nav>
    <Link href="/">
      <a>Index</a>
    </Link>
    <Link href="/ssg">
      <a>SSG</a>
    </Link>
    <Link href="/ssr">
      <a>SSR</a>
    </Link>
    <style jsx>{`
      margin: 0 0.5rem;
      padding: 1rem 0;
    `}</style>
  </nav>
);
