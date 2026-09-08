import "./globals.css";

export const metadata = {
  title: "Next.js Email Auth with Local SMTP",
  description: "Magic-link sign in with Auth.js and Mailtrap Local",
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
