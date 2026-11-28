// `*.css` on a `.module.css` file only appends an existing extension, so the
// file keeps being handled as a CSS module
import styles from '../../styles.module.css' with { turbopackAs: '*.css' }

export default function Page() {
  return <p id="as-css-module">{typeof styles.foo}</p>
}
