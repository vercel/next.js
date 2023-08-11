import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col gap-4 mb-16">
        <div className="flex justify-center items-center">
          <h1 className="text-4xl font-bold text-center text-gray-900">
            Your Complete Access Control Library
          </h1>
        </div>
        <p className="text-center text-gray-700">
          Simplify Access Control with iamjs: Your Comprehensive Library for
          Effortless Authorization in Both Node.js and Browser Environments.
        </p>
      </div>
      <h3 className="text-xl font-bold text-center text-gray-900 mb-8">
        Choose your role:
      </h3>
      <div className="flex h-full flex-col xl:flex-row justify-center items-center w-full gap-4">
        <Link href="/admin">
          <Button size="lg">Login as admin</Button>
        </Link>
        <Link href="/editor">
          <Button size="lg">Login as editor</Button>
        </Link>
        <Link href="/viewer">
          <Button size="lg">Login as viewer</Button>
        </Link>
      </div>
      <div className="flex flex-col gap-4 mt-16">
        <h3 className="text-xl font-bold text-center text-gray-900">
          Read the docs:
        </h3>
        <div className="flex h-full justify-center items-center w-full gap-4">
          <Link target="_blank" href="https://iamjs.achaq.dev">
            <Button size="lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 mr-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              Documentation
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
