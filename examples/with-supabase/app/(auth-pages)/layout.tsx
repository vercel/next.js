import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl flex flex-col gap-12 items-start">
      <Link href="/" className="text-xs flex items-center hover:text-primary">
        <ChevronLeft size={14} />
        Back
      </Link>

      {children}
    </div>
  );
}
