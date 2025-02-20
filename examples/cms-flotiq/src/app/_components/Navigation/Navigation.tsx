import Link from "next/link";

export default function Navigation() {
  return (
    <nav
      className="sticky top-0 bg-white w-full z-10 py-9 border-b flex flex-col md:flex-row
                items-center justify-center md:justify-between gap-2"
    >
      <Link
        className="font-bold text-4xl no-underline hover:text-black"
        href="/"
      >
        Tech & Threads
      </Link>

      <span className="text-center">
        The source code for this blog is
        <Link
          className="text-nowrap ml-1"
          href="https://github.com/flotiq/flotiq-nextjs-blog-starter"
          target="_blank"
          rel="noreferrer"
        >
          available on GitHub
        </Link>
      </span>
    </nav>
  );
}
