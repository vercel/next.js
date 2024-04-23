import Image from "next/image";
import React from "react";
import styles from "./Loader.module.css";

interface ILoaderProps {
  done: boolean;
}
const Loader: React.FC<ILoaderProps> = ({ done }): JSX.Element =>
  done ? (
    <Image src="/check.png" alt="Loader" width={30} height={30} />
  ) : (
    <div className={styles.spinner} />
  );

export default Loader;
