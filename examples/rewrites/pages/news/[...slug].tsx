import { useRouter } from "next/router";
import Link from "next/link";
import styles from "../../styles.module.css";
import Code from "../../components/Code";

export default function News() {
  const { asPath, route, query } = useRouter();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {asPath}</h1>
        <hr className={styles.hr} />
        <p>
          This page was rendered by <Code>{`pages${route}.js`}</Code>.
        </p>
        <p>
          The query <Code>slug</Code> for this page is:{" "}
          <Code>{JSON.stringify(query.slug)}</Code>
        </p>
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  );
}

// Use SSR for this page as currently rewrites don't work with dynamic pages without SSR
export async function getServerSideProps() {
  return {
    props: {},
  };
}
