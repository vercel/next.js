import Link from "next/link";
import { useRouter } from "next/router";

export default function Nav() {
  const { pathname } = useRouter();

  return (
    <header>
      <Link href="/" className={pathname === "/" ? "is-active" : ""}>
        Home
      </Link>
      <Link
        href="/apollo"
        className={pathname === "/apollo" ? "is-active" : ""}
      >
        Apollo
      </Link>
      <Link href="/redux" className={pathname === "/redux" ? "is-active" : ""}>
        Redux
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
