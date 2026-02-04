import React from "react";
import styles from "../styles/LoaderWave.module.css";

const LoaderWave = () => {
  return (
    <div className={styles.holder}>
      <div className={`${styles.loader} ${styles.l1}`}></div>
      <div className={`${styles.loader} ${styles.l2}`}></div>
      <div className={`${styles.loader} ${styles.l3}`}></div>
    </div>
  );
};

export default LoaderWave;
