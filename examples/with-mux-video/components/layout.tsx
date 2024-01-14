import Head from "next/head";
import { MUX_HOME_PAGE_URL } from "../constants";

interface LayoutProps {
  title?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  image?: string;
  children: React.ReactNode;
  loadTwitterWidget?: boolean;
}

export default function Layout({
  title,
  description,
  metaTitle = "Mux + Next.js",
  metaDescription,
  image = "https://with-mux-video.vercel.app/mux-nextjs-og-image.png",
  children,
  loadTwitterWidget,
}: LayoutProps) {
  return (
    <div className="container">
      <Head>
        <title>Mux + Next.js</title>
        <link rel="icon" href="/favicon.ico" />
        {metaTitle && <meta property="og:title" content={metaTitle} />}
        {metaTitle && <meta property="twitter:title" content={metaTitle} />}
        {metaDescription && (
          <meta property="og:description" content={description} />
        )}
        {metaDescription && (
          <meta property="twitter:description" content={description} />
        )}
        {image && <meta property="og:image" content={image} />}
        {image && (
          <meta property="twitter:card" content="summary_large_image" />
        )}
        {image && <meta property="twitter:image" content={image} />}
        {loadTwitterWidget && (
          <script
            type="text/javascript"
            async
            src="https://platform.twitter.com/widgets.js"
          ></script>
        )}
      </Head>

      <main>
        <h1 className="title">{title}</h1>
        <p className="description">{description}</p>
        <div className="grid">{children}</div>
      </main>

      <footer>
        <a href={MUX_HOME_PAGE_URL} target="_blank" rel="noopener noreferrer">
          Powered by <img src="/mux.svg" alt="Mux Logo" className="logo" />
        </a>
      </footer>

      <style jsx>{`
        .container {
          min-height: 100vh;
          min-height: -webkit-fill-available;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        main {
          padding: 1rem 0 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        footer img {
          margin-left: 0.5rem;
          width: 71px;
        }

        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .title a {
          color: #0070f3;
          text-decoration: none;
        }

        .title a:hover,
        .title a:focus,
        .title a:active {
          text-decoration: underline;
        }

        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
        }

        .title,
        .description {
          text-align: center;
        }

        .description {
          line-height: 1.5;
          font-size: 1.5rem;
        }

        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }

        .grid {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;

          max-width: 800px;
          margin-top: 1rem;
        }

        .logo {
          height: 1em;
        }

        @media (max-width: 600px) {
          .grid {
            width: 100%;
            flex-direction: column;
          }
          .title {
            font-size: 2.5rem;
          }
          footer {
            height: 60px;
          }
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        a {
          color: #ff2b61;
        }

        p {
          line-height: 1.4rem;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
