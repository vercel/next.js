import Link from "../_components/Link";
import { MUX_HOME_PAGE_URL } from "../constants";

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="mb-8">
        <h1 className="font-bold text-4xl lg:text-5xl mb-2">
          Welcome to Mux + Next.js
        </h1>
        <p className="italic">Get started by uploading a video</p>
      </header>
      <p className="mb-4">
        <Link
          href={MUX_HOME_PAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mux
        </Link>{" "}
        provides APIs for developers working with video.
        <br />
        This example is useful if you want to build:
      </p>
      <ul className="list-disc pl-8 mb-4">
        <li>A video on demand service like Youtube or Netflix</li>
        <li>
          A platform that supports user uploaded videos like TikTok or Instagram
        </li>
        <li>Video into your custom CMS</li>
      </ul>
      <p className="mb-4">
        Uploading a video uses the Mux{" "}
        <Link href="https://docs.mux.com/docs/direct-upload">
          direct upload API
        </Link>
        . When the upload is complete your video will be processed by Mux and
        available for playback on a sharable URL.
      </p>
      <p>
        To learn more,{" "}
        <Link
          href="https://github.com/vercel/next.js/tree/canary/examples/with-mux-video"
          target="_blank"
          rel="noopener noreferrer"
        >
          check out the source code on GitHub
        </Link>
        .
      </p>
      <hr className="my-8 bg-gray-500" />
      {children}
    </>
  );
}
