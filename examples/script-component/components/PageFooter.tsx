"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PageFooter() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return <Link href="/">See all examples</Link>;
  }

  return null;
}
