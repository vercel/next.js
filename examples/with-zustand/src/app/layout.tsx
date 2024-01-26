import StoreProvider from "@/lib/storeProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <StoreProvider lastUpdate={new Date().getTime()}>
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
