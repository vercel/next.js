import Sidebar from "./_components/sidebar";
import styles from "./layout.module.css";

export const metadata = {
  title: "Layouts Example",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main className={styles.main}>
          <Sidebar />
          {children}
        </main>
      </body>
    </html>
  );
}
