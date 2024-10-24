import { VisitorData } from "@fingerprintjs/fingerprintjs-pro-react";

function VisitorDataPresenter({
  data,
  isLoading,
  error,
}: {
  data?: VisitorData;
  isLoading?: boolean;
  error?: Error;
}) {
  if (error) {
    return <p>An error occurred: {error.message}</p>;
  }

  return (
    <div className="visitor-data">
      <p>
        <b>Visitor ID:</b>{" "}
        {isLoading
          ? "Loading..."
          : data
          ? data.visitorId
          : "not established yet"}
      </p>
      {data && (
        <>
          <p>
            <b>Full visitor data:</b>
          </p>
          <pre className="details">{JSON.stringify(data, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export default VisitorDataPresenter;
