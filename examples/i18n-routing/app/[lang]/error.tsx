"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { getErrorDictionary } from "../../get-error-dictionary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ lang: string }>();
  const dictionary = getErrorDictionary(params.lang);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <h2>{dictionary.title}</h2>
      <button onClick={() => reset()}>{dictionary["try-again"]}</button>
    </div>
  );
}
