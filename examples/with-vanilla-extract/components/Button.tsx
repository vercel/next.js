"use client";

import * as styles from "./Button.css.ts";

export default function Button({ children }) {
  return (
    <button onClick={() => console.log("click")} className={styles.button}>
      {children}
    </button>
  );
}
