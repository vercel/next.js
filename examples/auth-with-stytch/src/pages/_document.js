import { Html, Head, Main, NextScript } from 'next/document'
import Image from 'next/image'
import Link from 'next/link'

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <header>
          <Link className="header" href="/">
            <Image alt="sdf" src="logo.svg" width={190} height={200} />
          </Link>
          <div class="link-container">
            <Link
              className="header"
              target="_blank"
              href="https://www.stytch.com/docs"
            >
              Stytch Docs
            </Link>
            <Link
              className="header"
              target="_blank"
              href="https://github.com/stytchauth/stytch-nextjs-example"
            >
              <Image
                alt="Github"
                src="github.svg"
                width={20}
                height={20}
                style={{ marginRight: '4px' }}
              />
              View on Github
            </Link>
          </div>
        </header>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
