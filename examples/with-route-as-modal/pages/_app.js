import styles from "../app-styles.module.css";

function MyApp({ Component, pageProps }) {
  return (
    <div className={styles.content}>
      <Component {...pageProps} />
    </div>
  );
}

export default MyApp;
