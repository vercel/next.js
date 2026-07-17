import Link from "next/link";

export default function PostNotFound() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Post not found</h1>
      <p className="mt-2 text-sm text-foreground/70">
        The post you are looking for does not exist.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm underline">
        Back to all posts
      </Link>
    </div>
  );
}
