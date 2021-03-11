import React, { ReactNode } from "react";
import Link from "next/link";
import Head from "next/head";

type Props = {
  children?: ReactNode;
  title?: string;
};

const Layout = ({ children, title = "This is the default title" }: Props) => (
  <div>
    <Head>
      <title>{title}</title>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <header>
      <nav className="fixed w-full z-10 top-0">
        <div class="w-full md:max-w-4xl mx-auto flex flex-grow items-center justify-between mt-0 py-3">
          <div class="w-full flex-grow flex justify-center mt-2">
            <ul class="flex flex-grow justify-center">
              <li class="mr-3">
                <Link href="/">
                  <a class="inline-block text-gray-600 no-underline hover:text-black hover:text-underline py-2 px-4">
                    Home
                  </a>
                </Link>
              </li>
              <li class="mr-3">
                <Link href="/users">
                  <a class="inline-block text-gray-600 no-underline hover:text-black hover:text-underline py-2 px-4">
                    Users List
                  </a>
                </Link>
              </li>
              <li class="mr-3">
                <a
                  class="inline-block text-gray-600 no-underline hover:text-black hover:text-underline py-2 px-4"
                  href="/api/users"
                >
                  Users API
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
    {children}
    <footer class="container w-full mx-auto border-t">
      <div class="w-full text-xl text-gray-800 justify-center items-center flex">
        <h1 class="text-gray-900 pt-6 pb-2 text-1xl md:text-2xl">
          I'm here to stay (Footer)
        </h1>
      </div>
    </footer>
  </div>
);

export default Layout;