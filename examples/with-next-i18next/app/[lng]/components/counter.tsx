"use client";

import { useState } from "react";
import { useT } from "next-i18next/client";

export function Counter() {
  const { t } = useT();
  const [count, setCount] = useState(0);

  return (
    <p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        {t("clicked", { count })}
      </button>{" "}
      <button type="button" onClick={() => setCount(0)}>
        {t("reset")}
      </button>
    </p>
  );
}
