import { SignedIn, SignedOut } from "@clerk/nextjs";
import styles from "../styles/Home.module.css";
import Link from "next/link";
import { APIRequest } from "./api-request";

const ClerkFeatures = () => (
  <Link href="/user" className={styles.cardContent}>
    <img src="/icons/layout.svg" />
    <div>
      <h3>Explore features provided by Clerk</h3>
      <p>
        Interact with the user button, user profile, and more to preview what
        your users will see
      </p>
    </div>
    <div className={styles.arrow}>
      <img src="/icons/arrow-right.svg" />
    </div>
  </Link>
);

const SignupLink = () => (
  <Link href="/sign-up" className={styles.cardContent}>
    <img src="/icons/user-plus.svg" />
    <div>
      <h3>Sign up for an account</h3>
      <p>
        Sign up and sign in to explore all the features provided by Clerk
        out-of-the-box
      </p>
    </div>
    <div className={styles.arrow}>
      <img src="/icons/arrow-right.svg" />
    </div>
  </Link>
);

// Main component using <SignedIn> & <SignedOut>.
//
// The SignedIn and SignedOut components are used to control rendering depending
// on whether or not a visitor is signed in.
//
// https://docs.clerk.dev/frontend/react/signedin-and-signedout
const Main = () => (
  <main className={styles.main}>
    <h1 className={styles.title}>Welcome to your new app</h1>
    <p className={styles.description}>Sign up for an account to get started</p>

    <div className={styles.cards}>
      <div className={styles.card}>
        <SignedIn>
          <ClerkFeatures />
        </SignedIn>
        <SignedOut>
          <SignupLink />
        </SignedOut>
      </div>

      <div className={styles.card}>
        <Link
          href="https://dashboard.clerk.dev"
          target="_blank"
          rel="noreferrer"
          className={styles.cardContent}
        >
          <img src="/icons/settings.svg" />
          <div>
            <h3>Configure settings for your app</h3>
            <p>
              Visit Clerk to manage instances and configure settings for user
              management, theme, and more
            </p>
          </div>
          <div className={styles.arrow}>
            <img src="/icons/arrow-right.svg" />
          </div>
        </Link>
      </div>
    </div>

    <APIRequest />

    <div className={styles.links}>
      <Link
        href="https://docs.clerk.dev"
        target="_blank"
        rel="noreferrer"
        className={styles.link}
      >
        <span className={styles.linkText}>Read Clerk documentation</span>
      </Link>
      <Link
        href="https://nextjs.org/docs"
        target="_blank"
        rel="noreferrer"
        className={styles.link}
      >
        <span className={styles.linkText}>Read Next.js documentation</span>
      </Link>
    </div>
  </main>
);

// Footer component
const Footer = () => (
  <footer className={styles.footer}>
    Powered by{" "}
    <a href="https://clerk.dev" target="_blank" rel="noopener noreferrer">
      <img src="/clerk.svg" alt="Clerk.dev" className={styles.logo} />
    </a>
    +
    <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer">
      <img src="/nextjs.svg" alt="Next.js" className={styles.logo} />
    </a>
  </footer>
);

export default function Home() {
  return (
    <div className={styles.container}>
      <Main />
      <Footer />
    </div>
  );
}
