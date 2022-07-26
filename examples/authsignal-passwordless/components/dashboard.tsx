import Link from "next/link";
import { User } from "../lib";
import styles from "./dashboard.module.css";

interface Props {
  user: User;
}

export const Dashboard = ({ user }: Props) => (
  <>
    <header className={styles.header}>
      <div className={styles.logo}>My Example App</div>
      <Link href={"/api/logout"}>
        <button>Log out</button>
      </Link>
    </header>
    <div className={styles.user}>
      <div>
        <div className={styles.label}>Logged in as:</div>
        <div>{user.email}</div>
      </div>
    </div>
  </>
);
