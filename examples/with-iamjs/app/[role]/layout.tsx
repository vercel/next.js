import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post - With Iamjs",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
