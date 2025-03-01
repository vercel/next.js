"use client"; // Ensure this runs only on the client

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PageFooter() {
  const pathname = usePathname(); // Use Next.js navigation instead of window.location

  if (pathname !== "/") {
    return <Link href="/">See all examples</Link>;
  }

  return null;
}
