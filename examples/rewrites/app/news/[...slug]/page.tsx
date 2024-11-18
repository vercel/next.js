import Link from "next/link";
import styles from "../../../styles.module.css";
import Code from "../../_components/Code";

export default function News({ params }: any) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{`Path: pages/${params.slug.join("/")}`}</h1>
        <hr className={styles.hr} />
        <p>
          This page was rendered by <Code>{`app/news/[...slug]/page.js`}</Code>.
        </p>
        <p>
          The query <Code>slug</Code> for this page is:{" "}
          <Code>{JSON.stringify(params.slug)}</Code>
        </p>
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  );
}
