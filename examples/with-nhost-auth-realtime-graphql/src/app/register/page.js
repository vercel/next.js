"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSignUpEmailPassword, useSignOut } from "@nhost/react";

export default function Register() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signOut } = useSignOut();

  const useSignUpEmailPasswordData = useSignUpEmailPassword();

  const {
    signUpEmailPassword,
    isLoading,
    isSuccess,
    isError,
    error,
    needsEmailVerification, // Important for email verification flow
  } = useSignUpEmailPasswordData;

  const handleRegister = async (e) => {
    e.preventDefault();
    await signUpEmailPassword(email, password, {
      displayName: displayName,
      // If you have other allowedSignUpOptions configured in Nhost,
      // like 'locale' or 'defaultRole', you can add them here.
      // e.g., locale: 'en'
      //
      // 'userData' is for custom user data fields you've defined in your Hasura schema
      // and allowed in Nhost settings.
      // For example, if you had a 'companyName' field:
      // userData: { companyName: 'Acme Corp' }
    });
  };

  useEffect(() => {
    if (isSuccess) {
      if (needsEmailVerification) {
        // Optionally, redirect to a page informing the user to check their email
        alert(
          "Registration successful! Please check your email to verify your account.",
        );
        // router.push('/check-email-notice'); // Or similar
      } else {
        // If email verification is not needed or already handled
        // alert("Registration successful!");
        // router.push("/"); // Redirect to home or dashboard
      }
    }
  }, [isSuccess, needsEmailVerification, router]);

  useEffect(() => {
    if (isError && error) {
      // You can provide more specific error messages based on error.message or error.code
      console.error("Registration error:", error);
      alert(`Registration failed: ${error.message || "Please try again."}`);
    }
  }, [isError, error]);

  return (
    <div>
      <h1>Register</h1>
      <pre>{JSON.stringify(useSignUpEmailPasswordData, undefined, 2)}</pre>
      <form onSubmit={handleRegister}>
        <div>
          <input
            placeholder="Display Name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6} // Example: Enforce a minimum password length
            disabled={isLoading}
          />
        </div>
        <div>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Registering..." : "Register"}
          </button>
        </div>
      </form>

      {needsEmailVerification && isSuccess && (
        <p style={{ color: "green" }}>
          Please check your email ({email}) to verify your account.
        </p>
      )}

      <div>
        <p>
          Already have an account? <Link href="/login">Login here</Link>
        </p>
        <p>
          Go to <Link href="/">index</Link>
        </p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    </div>
  );
}
