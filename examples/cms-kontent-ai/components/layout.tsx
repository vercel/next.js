import Alert from "./alert";
import Footer from "./footer";
import Meta from "./meta";

type LayoutProps = {
  preview: boolean;
  children: JSX.Element | JSX.Element[];
};

export default function Layout({ preview, children }: LayoutProps) {
  return (
    <>
      <Meta />
      <div className="min-h-screen">
        <Alert preview={preview} />
        <main>{children}</main>
      </div>
      <Footer />
    </>
  );
}
