import Alert from "../components/alert";
import Footer from "../components/footer";
import Meta from "../components/meta";

type LayoutProps = {
  preview: boolean;
  children: React.ReactNode;
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
