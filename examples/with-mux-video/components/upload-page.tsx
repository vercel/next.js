import Layout from "./layout";
import { MUX_HOME_PAGE_URL } from "../constants";

interface UploadPageProps {
  children: React.ReactNode;
}

export default function UploadPage({ children }: UploadPageProps) {
  return (
    <Layout
      title="Welcome to Mux + Next.js"
      description="Get started by uploading a video"
    >
      <div className="wrapper">
        <div className="about-mux">
          <p>
            <a
              href={MUX_HOME_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mux
            </a>{" "}
            provides APIs for developers working with video. This example is
            useful if you want to build:
          </p>
          <ul>
            <li>A video on demand service like Youtube or Netflix</li>
            <li>
              A platform that supports user uploaded videos like Tiktok or
              Instagram
            </li>
            <li>Video into your custom CMS</li>
          </ul>
          <p>
            Uploading a video uses the Mux{" "}
            <a href="https://docs.mux.com/docs/direct-upload">
              direct upload API
            </a>
            . When the upload is complete your video will be processed by Mux
            and available for playback on a sharable URL.
          </p>
          <p>
            To learn more,{" "}
            <a
              href="https://github.com/vercel/next.js/tree/canary/examples/with-mux-video"
              target="_blank"
              rel="noopener noreferrer"
            >
              check out the source code on GitHub
            </a>
            .
          </p>
        </div>
        <div className="children">{children}</div>
      </div>
      <style jsx>{`
        .about-mux {
          padding: 0 1rem 1.5rem 1rem;
          max-width: 600px;
        }
        .about-mux {
          line-height: 1.4rem;
        }
        .children {
          text-align: center;
          min-height: 230px;
        }
      `}</style>
    </Layout>
  );
}
