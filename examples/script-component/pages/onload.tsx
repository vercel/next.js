import { useMemo, useState } from "react";
import Script from "next/script";

export default function Onload() {
  const [stripe, setStripe] = useState<{ stripe: typeof window.Stripe } | null>(
    null,
  );
  const methods = useMemo(
    () =>
      stripe
        ? Object.entries(stripe.stripe).filter(
            ([_key, value]) => typeof value === "function",
          )
        : [],
    [stripe],
  );

  function handleLoad() {
    const stripe = window.Stripe("pk_test_1234");

    console.log("Stripe loaded: ", stripe);

    setStripe({ stripe });
  }

  return (
    <>
      {/* We load Stripe sdk */}
      <Script
        id="stripe-js"
        src="https://js.stripe.com/v3/"
        onLoad={handleLoad}
      />

      <main>
        <h1>Executing code after loading</h1>
        <div>
          <p>Stripe methods: </p>
          <ul>
            {methods.map(([method]) => (
              <li key={method}>{method}</li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
