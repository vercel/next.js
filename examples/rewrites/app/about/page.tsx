"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "../../styles.module.css";
import Code from "../_components/Code";

export default function About() {
  const pathname = usePathname();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {pathname}</h1>
        <hr className={styles.hr} />
        <p>
          {" "}
          This page was rendered by <Code>{`app/about.js`}</Code>.
        </p>
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  );
}
