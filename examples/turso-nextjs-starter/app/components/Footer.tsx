import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="z-10 w-full max-w-5xl mx-auto items-center justify-center font-mono text-sm lg:flex">
      <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
        <a
          className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto"
          href="https://turso.tech?utm_source=app-turso-nextjs-starte&utm_medium=turso-extended"
          target="_blank"
          rel="noopener noreferrer"
        >
          By{' '}
          <Image
            src="/turso.svg"
            alt="Turso Logo"
            className="block dark:hidden"
            width={150}
            height={36}
            priority
          />
          <Image
            src="/turso-light.svg"
            alt="Turso Logo"
            className="hidden dark:block"
            width={150}
            height={36}
            priority
          />
        </a>
      </div>
    </footer>
  )
}
