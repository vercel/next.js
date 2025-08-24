import Head from "next/head";
import styles from "../styles/Home.module.css";
import { connectToDatabase } from "../util/couchbase";

export default function Home({ isConnected }) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js with Couchbase!</a>
        </h1>

        {isConnected ? (
          <h2 className={`${styles.subtitle} ${styles.green}`}>
            You are connected to Couchbase
          </h2>
        ) : (
          <>
            <h2 className={`${styles.subtitle} ${styles.red}`}>
              You are NOT connected to Couchbase. Try refreshing the page, and
              if this error persists check the <code>README.md</code> for
              instructions.
            </h2>
            <em className={styles.center}>
              Note: if the database was recently started, you might have to
              re-start the app (in dev mode) or re-deploy to your serverless
              environment for changes to take effect.
            </em>
          </>
        )}

        <p className={styles.description}>
          Get started by editing{" "}
          <code className={styles.code}>pages/index.js</code>
        </p>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <img src="/vercel.svg" alt="Vercel Logo" className={styles.logo} />
        </a>
      </footer>
    </div>
  );
}

export async function getServerSideProps(context) {
  let connection = await connectToDatabase();

  const { collection } = connection;

  // Check connection with a KV GET operation for a key that doesnt exist
  let isConnected = false;
  try {
    await collection.get("testingConnectionKey");
  } catch (err) {
    // error message will return 'document not found' if and only if we are connected
    // (but this document is not present, we're only trying to test the connection here)
    if (err.message === "document not found") {
      isConnected = true;
    }
    // if the error message is anything OTHER THAN 'document not found', the connection is broken
  }

  return {
    props: { isConnected },
  };
}
