export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { NavBar } from "@/components/navbar";
import { checkDbConnection } from "@/lib/db/client";

const deployToVercelUrl =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-neon&project-name=with-neon-app&repository-name=with-neon-app&env=DATABASE_URL&env=BETTER_AUTH_SECRET&env=BETTER_AUTH_URL&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D";

const exampleSourceUrl =
  "https://github.com/vercel/next.js/tree/canary/examples/with-neon";

export default async function Home() {
  const result = await checkDbConnection();
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 md:max-w-lg md:px-0 lg:max-w-xl">
        <NavBar />
        <main className="flex flex-1 flex-col justify-center">
          <h1 className="text-3xl font-semibold leading-none tracking-tighter md:text-4xl md:leading-none lg:text-5xl lg:leading-none">
            Vercel with Neon Postgres
          </h1>
          <p className="mt-3.5 max-w-lg text-base leading-snug tracking-tight text-[#61646B] md:text-lg md:leading-snug lg:text-xl lg:leading-snug dark:text-[#94979E]">
            A minimal template for building full-stack React applications using
            Next.js, Vercel, and Neon.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5 md:mt-9 lg:mt-10">
            <Link
              className="rounded-full bg-[#00E599] px-5 py-2.5 font-semibold tracking-tight text-[#0C0D0D] transition-colors duration-200 hover:bg-[#00E5BF] lg:px-7 lg:py-3"
              href={deployToVercelUrl}
              target="_blank"
            >
              Deploy to Vercel
            </Link>
            <Link
              className="group flex items-center gap-2 leading-none tracking-tight"
              href={exampleSourceUrl}
              target="_blank"
            >
              View on GitHub
              <Image
                className="transition-transform duration-200 group-hover:translate-x-1 dark:invert"
                src="/arrow.svg"
                alt=""
                width={16}
                height={10}
                priority
              />
            </Link>
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E5E7] py-5 sm:gap-2 sm:gap-6 md:pb-12 md:pt-10 dark:border-[#303236]">
          <ul className="flex items-center gap-4 sm:gap-6">
            {[
              {
                text: "Docs",
                href: "https://neon.tech/docs/",
                icon: "/docs.svg",
              },
              {
                text: "Discord",
                href: "https://discord.com/invite/92vNTzKDGp",
                icon: "/discord.svg",
              },
            ].map((link) => (
              <Link
                className="flex items-center gap-2 opacity-70 transition-opacity duration-200 hover:opacity-100"
                key={link.text}
                href={link.href}
                target="_blank"
              >
                <Image
                  className="dark:invert"
                  src={link.icon}
                  alt=""
                  width={16}
                  height={16}
                  priority
                />
                <span className="text-sm tracking-tight">{link.text}</span>
              </Link>
            ))}
          </ul>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              result === "Database connected"
                ? "border-[#00E599]/20 bg-[#00E599]/10 text-[#1a8c66] dark:bg-[#00E599]/10 dark:text-[#00E599]"
                : "border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-500"
            }`}
          >
            {result}
          </span>
        </footer>
      </div>
    </div>
  );
}
