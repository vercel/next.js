import { SignUp } from "@clerk/nextjs";
import styles from "../../../styles/Auth.module.css";

export default function Page() {
  return (
    <div className={styles.auth}>
      <SignUp />
    </div>
  );
}
