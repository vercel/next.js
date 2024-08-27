import Link from "next/link";
import Step from "./Step";

export default function SignUpUserSteps() {
  return (
    <ol className="flex flex-col gap-6">
      <Step title="Sign up your first user">
        <p>
          Head over to the{" "}
          <Link
            href="/login"
            className="font-bold hover:underline text-foreground/80"
          >
            Login
          </Link>{" "}
          page and sign up your first user. It's okay if this is just you for
          now. Your awesome idea will have plenty of users later!
        </p>
      </Step>
    </ol>
  );
}
