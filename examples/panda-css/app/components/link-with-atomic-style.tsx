import { css } from "@/styled-system/css";

const styles = css({
  fontSize: "lg",
  color: {
    _default: "gray.800",
    _osDark: "gray.100",
  },
  fontFamily: "inter",
});

/**
 * Link with atomic styles
 * @see https://panda-css.com/docs/concepts/writing-styles#atomic-styles
 */
export default function LinkWithAtomicStyle() {
  return (
    <a
      className={styles}
      href="https://panda-css.com/docs/concepts/writing-styles#atomic-styles"
      target="_blank"
      rel="noreferrer"
    >
      Link with <b>atomic style</b>
      <span className="icon">-&gt;</span>
    </a>
  );
}
