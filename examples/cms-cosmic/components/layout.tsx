import Alert from "./alert";
import Footer from "./footer";
import Meta from "./meta";
import "lazysizes";
import "lazysizes/plugins/parent-fit/ls.parent-fit";
import { ReactNode } from "react";

type LayoutProps = {
  preview: boolean;
  children: ReactNode;
};

const Layout = ({ preview, children }: LayoutProps) => {
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
};

export default Layout;
