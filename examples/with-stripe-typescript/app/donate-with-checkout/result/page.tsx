import type { Stripe } from "stripe";

import PrintObject from "@/components/PrintObject";
import { stripe } from "@/lib/stripe";

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}): Promise<JSX.Element> {
  const { session_id } = await searchParams;
  if (!session_id)
    throw new Error("Please provide a valid session_id (`cs_test_...`)");

  const checkoutSession: Stripe.Checkout.Session =
    await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items", "payment_intent"],
    });

  const paymentIntent = checkoutSession.payment_intent as Stripe.PaymentIntent;

  return (
    <>
      <h2>Status: {paymentIntent.status}</h2>
      <h3>Checkout Session response:</h3>
      <PrintObject content={checkoutSession} />
    </>
  );
}
