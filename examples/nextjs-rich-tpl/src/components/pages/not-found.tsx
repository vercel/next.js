import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound({ title }: { title: string }) {
  return (
    <div className="flex justify-center items-center w-full h-full min-h-[calc(100dvh-64px)]">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
    </div>
  );
}
