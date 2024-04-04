import { Descope } from "@descope/nextjs-sdk";

export default function Page() {
  return (
    <div className="bg-gray-50 dark:bg-gray-950 min-h-screen flex flex-col justify-center items-center">
      <div className="container max-w-md px-4 md:px-6 py-8 md:py-12 lg:py-16 bg-white dark:bg-gray-800 rounded-lg shadow">
        <Descope
          flowId="sign-up-or-in"
          redirectAfterSuccess="/"
          redirectAfterError="/"
        />
      </div>
    </div>
  );
}
