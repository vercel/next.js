import styles from "../styles.module.css";
import Link from "next/link";
import Code from "../components/Code";

export default function Index() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Rewrites with Next.js</h1>
        <hr className={styles.hr} />
        <p>
          The links below are{" "}
          <Link
            href="https://nextjs.org/docs/api-reference/next.config.js/rewrites"
            legacyBehavior
          >
            <>
              custom <Code>rewrites</Code>
            </>
          </Link>{" "}
          that map an incoming request path to a different destination path.
        </p>
        <nav>
          <ul className={styles.list}>
            <li>
              <Link href="/about" as="/team">
                Visit /team
              </Link>
            </li>
            <li>
              <Link href="/about" as="/about-us">
                Visit /about-us
              </Link>
            </li>
            <li>
              <Link href="/post/first-post">Visit /post/first-post</Link>
            </li>
            <li>
              <Link href="/blog/2020/first-post">
                Visit /blog/2020/first-post
              </Link>
            </li>
            <li>
              <Link href="/docs/page">Visit External URL</Link>
            </li>
          </ul>
        </nav>
        <p>
          Open <Code>next.config.js</Code> to learn more about the rewrites that
          match the links above.
        </p>
        <hr className={styles.hr} />
      </div>
    </div>
  );
}
