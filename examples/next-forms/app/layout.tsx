import "./global.css";

export const metadata = {
  title: "Next.js Forms Example",
  description: "Example application with forms and Postgres.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
