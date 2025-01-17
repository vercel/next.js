import { css } from "@/styled-system/css";
import LinkWithAtomicStyle from "@/app/components/link-with-atomic-style";
import LinkWithAtomicRecipe from "@/app/components/link-with-atomic-recipe";
import LinkWithConfigRecipe from "@/app/components/link-with-config-recipe";
import LinkWithTextStyles from "@/app/components/link-with-text-styles";

const styles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2rem",
  p: "6rem",
  minH: "100vh",
});

export default function Home() {
  return (
    <main className={styles}>
      <LinkWithAtomicStyle />
      <LinkWithAtomicRecipe />
      <LinkWithConfigRecipe />
      <LinkWithTextStyles />
    </main>
  );
}
