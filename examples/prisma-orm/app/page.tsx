import prisma from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";

export default async function Home() {
  const users = await prisma.user.findMany();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <h1 className="text-3xl font-bold mb-8 font-[family-name:var(--font-barlow)] text-gray-900">
        Superblog
      </h1>
      <p className="max-w-lg text-center text-sm text-gray-600 mb-4">
        This is a starter blog app built with{" "}
        <a
          href="https://www.prisma.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Prisma ORM
        </a>{" "}
        and{" "}
        <a
          href="https://nextjs.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Next.js
        </a>
        . It demonstrates basic CRUD functionalities using Prisma ORM and{" "}
        <a
          href="https://www.prisma.io/postgres"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Prisma Postgres
        </a>
        .
      </p>

      {users.length === 0 ? (
        <p className="font-[family-name:var(--font-barlow)] text-base mb-4">
          No users found.
        </p>
      ) : (
        <>
          <div className="font-[family-name:var(--font-barlow)] max-w-3xl bg-white shadow-md p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 text-center">
              Authors
            </h2>
            <div className="flex space-x-4 justify-center">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center bg-gray-100 p-4 rounded-lg shadow"
                >
                  <Image
                    src="/avatar.png"
                    alt={user.name ?? "Author image"}
                    height={48}
                    width={48}
                    className="w-12 h-12 rounded-full mr-2"
                  />
                  <span className="text-lg font-medium text-gray-800">
                    {user.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/posts"
            className="mt-4 text-blue-500 hover:underline font-[family-name:var(--font-barlow)]"
          >
            See Posts
          </Link>
        </>
      )}
    </div>
  );
}
