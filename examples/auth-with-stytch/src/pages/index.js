import { useEffect } from "react";
import { useRouter } from "next/router";
import { useStytchUser } from "@stytch/nextjs";
import Login from "src/components/Login";

// In this app the index route (/) is a login page. We use the Stytch Next.js SDK to redirect the user if they are already logged in.
export default function LoginPage() {
  const { user, isInitialized } = useStytchUser();
  const router = useRouter();
  // If the Stytch SDK detects a User then redirect to profile; for example if a logged in User navigated directly to this URL.
  useEffect(() => {
    if (isInitialized && user) {
      router.replace("/profile");
    }
  }, [user, isInitialized, router]);

  return <Login />;
}
