"use client";

import { useEffect, useState } from "react";

import { Status } from "./types";
import Link from "@/app/_components/Link";

const Oops = () => (
  <p>
    This is awkward. Let's <Link href="/">refresh</Link> and try again.
  </p>
);

type Props = {
  initialStatus: Status;
  checkAssetStatus: () => Promise<Status>;
};
export default function AssetStatusPoll({
  initialStatus,
  checkAssetStatus,
}: Props) {
  const [{ status, errors }, setStatus] = useState<Status>(() => initialStatus);

  useEffect(() => {
    const poll = async () => setStatus(await checkAssetStatus());
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [checkAssetStatus]);

  switch (status) {
    case "preparing":
      return <p className="animate-pulse">Asset is preparing...</p>;
    case "errored":
      return (
        <div>
          <p className="mb-4">Asset encountered an error.</p>
          {Array.isArray(errors) && (
            <ul className="mb-4">
              {errors.map((error, key) => (
                <li key={key}>{JSON.stringify(error)}</li>
              ))}
            </ul>
          )}
          <Oops />
        </div>
      );
    case "ready":
      return (
        <div>
          <p className="mb-4">
            Asset is ready. The app really should've redirected you to it by
            now.
          </p>
          <Oops />
        </div>
      );
    default:
      return (
        <div>
          <p className="mb-4">Asset is in an unknown state.</p>
          <pre className="mb-4">{JSON.stringify({ status, errors })}</pre>
          <Oops />
        </div>
      );
  }
}
