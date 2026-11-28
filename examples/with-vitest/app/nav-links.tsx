"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav>
      <Link className={pathname === "/" ? "active" : ""} href="/">
        Home
      </Link>
      <Link className={pathname === "/about" ? "active" : ""} href="/about">
        About
      </Link>
    </nav>
  );
}
