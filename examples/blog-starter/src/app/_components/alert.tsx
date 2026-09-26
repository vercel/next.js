import Container from "@/app/_components/container";
import { EXAMPLE_PATH } from "@/lib/constants";
import cn from "classnames";

type Props = {
  preview?: boolean;
};

const Alert = ({ preview }: Props) => {
  return (
    <div
      className={cn("border-b dark:bg-slate-800", {
        "bg-neutral-800 border-neutral-800 text-white": preview,
        "bg-neutral-50 border-neutral-200": !preview,
      })}
    >
      <Container>
        <div className="py-2 text-center text-sm">
          {preview ? (
            <p>
              This page is a preview.{" "}
              <a
                href="/api/exit-preview"
                className="underline hover:text-teal-300 transition-colors duration-200"
                aria-label="Exit preview mode"
              >
                Click here
              </a>{" "}
              to exit preview mode.
            </p>
          ) : (
            <p>
              The source code for this blog is{" "}
              <a
                href={`https://github.com/vercel/next.js/tree/canary/examples/${EXAMPLE_PATH}`}
                className="underline hover:text-blue-600 transition-colors duration-200"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source code on GitHub"
              >
                available on GitHub
              </a>
              .
            </p>
          )}
        </div>
      </Container>
    </div>
  );
};

export default Alert;
