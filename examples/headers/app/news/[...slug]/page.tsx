import Link from "next/link";
import styles from "/styles.module.css";
import Code from "../../_components/Code";

type NewsProps = {
  params: { slug: [] };
};

export default function News({ params }: NewsProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {`/news/${params.slug.join("/")}`}</h1>
        <hr className={styles.hr} />
        <p>
          The response contains a custom header{" "}
          <Code>X-News-Custom-Header</Code> : <Code>news_header_value</Code>.
        </p>
        <p>
          To check the response headers of this page, open the Network tab
          inside your browser inspector.
        </p>
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  );
}
