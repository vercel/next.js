import Alert from "./alert";
import Footer from "./footer";

export default function Layout({ preview, children }) {
  return (
    <>
      <div className="min-h-screen">
        <Alert preview={preview} />
        <main>{children}</main>
      </div>
      <Footer />
    </>
  );
}
