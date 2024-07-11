"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "../../../styles.module.css";
import Code from "../../_components/Code";

export default function News({ params }: Params) {
  const pathname = usePathname();
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Path: {pathname}</h1>
        <hr className={styles.hr} />
        <p>
          The query <Code>slug</Code> for this page is:{" "}
          <Code>{JSON.stringify(params.slug)}</Code>
        </p>
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  );
}
type Params = {
  params: {
    slug: string;
  };
};
