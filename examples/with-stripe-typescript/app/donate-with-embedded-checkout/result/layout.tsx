import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout Session Result",
};

export default function ResultLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="page-container">
      <h1>Checkout Session Result</h1>
      {children}
    </div>
  );
}
