import { TutorialStep } from "./tutorial-step";

export function ConnectNeonSteps() {
  return (
    <ol className="flex flex-col gap-6">
      <TutorialStep title="Create Neon project">
        <p>
          Head over to{" "}
          <a
            href="https://pg.new"
            target="_blank"
            className="font-bold hover:underline text-foreground/80"
            rel="noreferrer"
          >
            pg.new
          </a>{" "}
          and create a new Neon project.
        </p>
      </TutorialStep>

      <TutorialStep title="Enable Neon Auth">
        <p>
          In the{" "}
          <a
            href="https://console.neon.tech"
            target="_blank"
            className="font-bold hover:underline text-foreground/80"
            rel="noreferrer"
          >
            Neon Console
          </a>
          , open the <strong>Auth</strong> page of your project and click{" "}
          <strong>Enable Auth</strong>. Neon Auth stores users and sessions in
          the <code>neon_auth</code> schema of your database.
        </p>
      </TutorialStep>

      <TutorialStep title="Declare environment variables">
        <p>
          Rename the{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            .env.example
          </span>{" "}
          file in your Next.js app to{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            .env.local
          </span>{" "}
          and populate it with the connection string from your project&apos;s{" "}
          <strong>Connect</strong> dialog and the Auth URL from{" "}
          <strong>Auth &gt; Configuration</strong>. Generate a cookie secret
          with{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            openssl rand -base64 32
          </span>
          .
        </p>
      </TutorialStep>

      <TutorialStep title="Restart your Next.js development server">
        <p>
          You may need to quit your Next.js development server and run{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            npm run dev
          </span>{" "}
          again to load the new environment variables.
        </p>
      </TutorialStep>

      <TutorialStep title="Refresh the page">
        <p>
          You may need to refresh the page for Next.js to load the new
          environment variables.
        </p>
      </TutorialStep>
    </ol>
  );
}
