import { css } from "@/styled-system/css";

const styles = css({
  textStyle: "link",
  color: {
    _default: "gray.800",
    _osDark: "gray.100",
  },
});

/**
 * Link with text styles
 * @see https://panda-css.com/docs/theming/text-styles#defining-text-styles
 */
export default function LinkWithTextStyles() {
  return (
    <a
      className={styles}
      href="https://panda-css.com/docs/theming/text-styles#defining-text-styles"
      target="_blank"
      rel="noreferrer"
    >
      Link with <b>text styles</b>
      <span className="icon">-&gt;</span>
    </a>
  );
}
