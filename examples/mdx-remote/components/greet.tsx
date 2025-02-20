import styles from "./greet.module.css";

export function Greet({ name = "world" }: { name: string }) {
  return <div className={styles.div}>Hello, {name}!</div>;
}
