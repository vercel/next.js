import Link from "next/link";

export default function Navigation() {
  return (
    <nav className="sticky top-0 bg-white w-full z-10 py-2 lg:py-4 border-b">
      <Link
        className="font-bold text-3xl lg:text-4xl 2xl:text-5xl no-underline hover:text-black"
        href="/"
      >
        Tech & Threads
      </Link>
    </nav>
  );
}
