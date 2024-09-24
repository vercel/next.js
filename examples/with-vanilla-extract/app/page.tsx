import * as styles from "./page.css.ts";

import Logo from "@/components/Logo";
import Button from "@/components/Button";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <main className={styles.page}>
        <Logo />
        <Button>Button</Button>
      </main>
      <Footer />
    </>
  );
}
