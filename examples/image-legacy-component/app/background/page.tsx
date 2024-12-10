import Image from "next/legacy/image";
import ViewSource from "@/components/view-source";
import styles from "@/styles/styles.module.css";

export default function Background() {
  return (
    <div>
      <ViewSource pathname="app/background/page.tsx" />
      <div className={styles.bgWrap}>
        <Image
          alt="Mountains"
          src="/mountains.jpg"
          layout="fill"
          objectFit="cover"
          quality={100}
        />
      </div>
      <p className={styles.bgText}>
        Image Component
        <br />
        as a Background
      </p>
    </div>
  );
}
