import { useEffect } from "react";
import Router, { useRouter } from "next/router";
import Link from "next/link";
import useSwr from "swr";
import Spinner from "../../components/spinner";
import ErrorMessage from "../../components/error-message";
import UploadPage from "../../components/upload-page";

const fetcher = (url: string) => {
  return fetch(url).then((res) => res.json());
};

export default function Asset() {
  const router = useRouter();

  const { data, error } = useSwr(
    () => (router.query.id ? `/api/asset/${router.query.id}` : null),
    fetcher,
    { refreshInterval: 5000 },
  );

  const asset = data && data.asset;

  useEffect(() => {
    if (asset && asset.playback_id && asset.status === "ready") {
      Router.push(`/v/${asset.playback_id}`);
    }
  }, [asset]);

  let errorMessage: string = "";

  if (error) {
    errorMessage = "Error fetching api";
  }

  if (data && data.error) {
    errorMessage = data.error;
  }

  if (asset && asset.status === "errored") {
    const message = asset.errors && asset.errors.messages[0];
    errorMessage = `Error creating this asset: ${message}`;
  }

  return (
    <UploadPage>
      {errorMessage ? (
        <>
          <ErrorMessage message={errorMessage} />
          <p>
            Go <Link href="/">back home</Link> to upload another video.
          </p>
        </>
      ) : (
        <>
          <div>Preparing...</div>
          <Spinner />
        </>
      )}
    </UploadPage>
  );
}
