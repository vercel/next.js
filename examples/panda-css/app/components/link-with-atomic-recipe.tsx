import { cva } from "@/styled-system/css";

const styles = cva({
  base: {
    color: {
      _default: "gray.800",
      _osDark: "gray.100",
    },
    fontFamily: "inter",
  },
  variants: {
    size: {
      sm: { fontSize: "sm" },
      lg: { fontSize: "lg" },
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

/**
 * Link with atomic recipe
 * @see https://panda-css.com/docs/concepts/recipes#atomic-recipe-or-cva
 */
export default function LinkWithAtomicRecipe() {
  return (
    <a
      className={styles({ size: "lg" })}
      href="https://panda-css.com/docs/concepts/recipes#atomic-recipe-or-cva"
      target="_blank"
      rel="noreferrer"
    >
      Link with <b>atomic recipe</b>
      <span className="icon">-&gt;</span>
    </a>
  );
}
