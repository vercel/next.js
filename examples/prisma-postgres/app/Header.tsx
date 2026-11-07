"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full bg-card shadow-md py-4 px-8 border-b border-border">
      <nav className="flex justify-between items-center">
        <Link
          href="/"
          className="text-xl font-bold text-foreground hover:text-primary transition-colors"
        >
          Superblog
        </Link>
        <div className="space-x-4">
          <Link href="/posts" className="text-primary hover:underline">
            Posts
          </Link>
          <Link href="/posts/new" className="text-primary hover:underline">
            New Post
          </Link>
          <Link
            href="/users/new"
            className="bg-primary text-white px-4 py-2 rounded-lg hover:brightness-110 transition"
          >
            New User
          </Link>
        </div>
      </nav>
    </header>
  );
}
