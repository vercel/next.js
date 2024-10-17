"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "../../styles.module.css";
import Code from "../_components/Code";

export default function About() {
  const pathname = usePathname();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    setPath(pathname);
  }, [pathname]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {path}</h1>
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
