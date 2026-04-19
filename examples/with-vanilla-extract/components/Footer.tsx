import * as styles from "./Footer.css.ts";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.details}>
        <p>
          Built with{" "}
          <a
            className={styles.link}
            target="_blank"
            href="https://nextjs.org"
            rel="noreferrer"
          >
            Next.js
          </a>{" "}
          and{" "}
          <a
            className={styles.link}
            target="_blank"
            href="https://vanilla-extract.style/"
            rel="noreferrer"
          >
            Vanilla Extract
          </a>{" "}
        </p>
      </div>
    </footer>
  );
}
