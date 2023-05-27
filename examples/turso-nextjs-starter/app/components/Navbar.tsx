import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="fixed left-0 top-0 flex w-full border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
      <div className="py-2 px-4 flex space-x-2">
        <Link
          href="/"
          className="hover:underline hover:text-teal-800"
          title="Home"
        >
          Home
        </Link>
        <Link
          href="/add-new"
          className="hover:underline hover:text-teal-800"
          title="Add New"
        >
          Add New
        </Link>
        <Link
          href="/about"
          className="hover:underline hover:text-teal-800"
          title="About"
        >
          About
        </Link>
      </div>
    </nav>
  );
}
