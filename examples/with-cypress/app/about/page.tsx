import AboutComponent from "../../components/about-component";
import styles from "../../styles/Home.module.css";

export default function About() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <AboutComponent />
      </main>
    </div>
  );
}
