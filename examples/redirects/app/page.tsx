import styles from "../styles.module.css";
import Link from "next/link";
import Code from "./_components/Code";

export default function Home() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className="text-white">Redirects with Next.js</h1>
        <hr className={styles.hr} />
        <p>
          The links below are custom
          <Link
            href="https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects"
            legacyBehavior
          >
            <>
              <Code>redirects</Code>
            </>
          </Link>{" "}
          that redirect an incoming request path to a different destination
          path.
        </p>
        <nav>
          <ul className={styles.list}>
            <li>
              <Link href="/team">Visit /team (redirects to /about)</Link>
            </li>
            <li>
              <Link href="/old-blog/hello-world">
                Visit /old-blog/hello-world (redirects to /news/hello-world)
              </Link>
            </li>
            <li>
              <Link href="/blog/a/b/hello-world">
                Visit /blog/a/b/hello-world (redirects to /news/a/b/hello-world)
              </Link>
            </li>
            <li>
              <Link href="/post/123">
                Visit /post/123 (redirects to /news/123)
              </Link>
            </li>
          </ul>
        </nav>
        <p>
          Open <Code>next.config.js</Code> to learn more about the redirects
          that match the links above.
        </p>
        <hr className={styles.hr} />
      </div>
    </div>
  );
}
