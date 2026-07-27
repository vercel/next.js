import type { Stripe } from "stripe";

export default function PrintObject({
  content,
}: {
  content: Stripe.PaymentIntent | Stripe.Checkout.Session;
}): JSX.Element {
  const formattedContent: string = JSON.stringify(content, null, 2);
  return <pre>{formattedContent}</pre>;
}
