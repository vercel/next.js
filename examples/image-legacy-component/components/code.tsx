import styles from "@/styles/styles.module.css";

export default function Code({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <code className={styles.inlineCode}>{children}</code>;
}
