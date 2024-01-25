import { useRouter } from "next/router";
import Link from "next/link";

export default function Header() {
  const { pathname } = useRouter();

  return (
    <header>
      <Link href="/" legacyBehavior>
        <a className={pathname === "/" ? "is-active" : ""}>Home</a>
      </Link>
      <Link href="/about" legacyBehavior>
        <a className={pathname === "/about" ? "is-active" : ""}>About</a>
      </Link>
      <Link href="/client-only" legacyBehavior>
        <a className={pathname === "/client-only" ? "is-active" : ""}>
          Client-Only
        </a>
      </Link>
      <Link href="/ssr" legacyBehavior>
        <a className={pathname === "/ssr" ? "is-active" : ""}>SSR</a>
      </Link>
      <style jsx>{`
        header {
          margin-bottom: 25px;
        }
        a {
          font-size: 14px;
          margin-right: 15px;
          text-decoration: none;
        }
        .is-active {
          text-decoration: underline;
        }
      `}</style>
    </header>
  );
}
