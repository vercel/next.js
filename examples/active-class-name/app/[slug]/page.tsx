"use client";

import { usePathname } from "next/navigation";
import Nav from "../../components/Nav";

const SlugPage = () => {
  const pathname = usePathname();

  return (
    <>
      <Nav />
      <p>Hello, I'm the {pathname} page</p>
    </>
  );
};

export default SlugPage;
