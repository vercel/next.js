import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EnvVarWarning() {
  return (
    <div className="flex gap-4 items-center">
      <div>
        <Badge variant={"outline"} className="font-normal pointer-events-none">
          Missing .env file with{" "}
          <code className="mx-1 text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="mx-1 text-[11px]">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
        </Badge>
      </div>
      <div className="flex gap-2">
        <Button
          asChild
          size="sm"
          variant={"outline"}
          disabled
          className="opacity-75 cursor-none pointer-events-none"
        >
          <Link href="/login">Login</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={"default"}
          disabled
          className="opacity-75 cursor-none pointer-events-none"
        >
          <Link href="/signup">Sign up</Link>
        </Button>
      </div>
    </div>
  );
}
