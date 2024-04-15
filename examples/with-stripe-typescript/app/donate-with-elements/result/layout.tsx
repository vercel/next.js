import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Intent Result",
};

export default function ResultLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="page-container">
      <h1>Payment Intent Result</h1>
      {children}
    </div>
  );
}
