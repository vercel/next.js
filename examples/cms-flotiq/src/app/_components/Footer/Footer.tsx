import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="flex flex-col sm:flex-row items-center gap-2 py-2 md:py-4 border-t mt-auto">
      <Link
        className="font-bold text-xl lg:text-2xl xl:text-3xl no-underline hover:text-black"
        href="/"
      >
        Tech & Threads
      </Link>

      <div
        className="flex flex-wrap justify-center items-center 
                  gap-y-2 gap-x-4 sm:ml-auto text-sm lg:text-base"
      >
        <Link
          className="font-bold no-underline"
          href="https://flotiq.com/?utm_source=poweredByFlotiq&utm_medium=poweredBy"
          target="_blank"
          rel="noreferrer"
        >
          <Image
            className="inline align-middle mr-2"
            src={"/assets/flotiq-logo.svg"}
            alt="Flotiq"
            width={20}
            height={20}
          />
          Powered by Flotiq
        </Link>
        Copyright &copy; Flotiq 2025
      </div>
    </footer>
  );
}
