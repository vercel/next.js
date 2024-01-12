import Link from "next/link";
import styles from "../styles.module.css";
import Code from "../components/Code";

export default function Index() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Headers with Next.js</h1>
        <hr className={styles.hr} />
        <p>
          The links below are examples of{" "}
          <Link
            href="https://nextjs.org/docs/api-reference/next.config.js/headers"
            legacyBehavior
          >
            <>
              custom <Code>headers</Code>
            </>
          </Link>{" "}
          added to your Next.js app.
        </p>
        <nav>
          <ul className={styles.list}>
            <li>
              <a href="/about">
                Visit /about (it contains a X-About-Custom-Header)
              </a>
            </li>
            <li>
              <Link href="/news/123">
                Visit /news/123 (it contains a X-News-Custom-Header)
              </Link>
            </li>
          </ul>
        </nav>
        <p>
          Open <Code>next.config.js</Code> to learn more about the headers that
          match the links above.
        </p>
        <hr className={styles.hr} />
      </div>
    </div>
  );
}
