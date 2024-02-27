import Step from "./Step";

export default function ConnectSupabaseSteps() {
  return (
    <ol className="flex flex-col gap-6">
      <Step title="Create Supabase project">
        <p>
          Head over to{" "}
          <a
            href="https://app.supabase.com/project/_/settings/api"
            target="_blank"
            className="font-bold hover:underline text-foreground/80"
            rel="noreferrer"
          >
            database.new
          </a>{" "}
          and create a new Supabase project.
        </p>
      </Step>

      <Step title="Declare environment variables">
        <p>
          Rename the{" "}
          <span className="px-2 py-1 rounded-md bg-foreground/20 text-foreground/80">
            .env.example
          </span>{" "}
          file in your Next.js app to{" "}
          <span className="px-2 py-1 rounded-md bg-foreground/20 text-foreground/80">
            .env.local
          </span>{" "}
          and populate with values from{" "}
          <a
            href="https://app.supabase.com/project/_/settings/api"
            target="_blank"
            className="font-bold hover:underline text-foreground/80"
            rel="noreferrer"
          >
            your Supabase project's API Settings
          </a>
          .
        </p>
      </Step>

      <Step title="Restart your Next.js development server">
        <p>
          You may need to quit your Next.js development server and run{" "}
          <span className="px-2 py-1 rounded-md bg-foreground/20 text-foreground/80">
            npm run dev
          </span>{" "}
          again to load the new environment variables.
        </p>
      </Step>

      <Step title="Refresh the page">
        <p>
          You may need to refresh the page for Next.js to load the new
          environment variables.
        </p>
      </Step>
    </ol>
  );
}
