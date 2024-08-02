import { Metadata } from "next";

import Main from "./_components/main";

export const metadata: Metadata = {
  title: "Login",
  description: "Login to your account",
};

export default function Page() {
  return <Main />;
}
