import styles from "../app-styles.module.css";

export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.content}>
          {children}
          {modal}
        </div>
      </body>
    </html>
  );
}
