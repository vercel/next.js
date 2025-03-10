import styles from "./post.module.css";

type PostProps = {
  title: string;
  children: React.ReactNode;
};

export default function Post({ title, children }: PostProps) {
  return (
    <div className={styles.main}>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
