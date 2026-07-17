import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <p className="text-sm text-foreground/70">This post no longer exists.</p>
      <Link href="/" className="mt-2 inline-block text-sm underline">
        Back to feed
      </Link>
    </div>
  );
}
