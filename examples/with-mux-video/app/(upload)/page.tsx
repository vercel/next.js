import Mux from "@mux/mux-node";
import MuxUploader from "./MuxUploader";
import { redirect } from "next/navigation";

// reads MUX_TOKEN_ID and MUX_TOKEN_SECRET from your environment
const mux = new Mux();

const createUpload = async () => {
  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: ["public"],
      encoding_tier: "baseline",
    },
    // in production, you'll want to change this origin to your-domain.com
    cors_origin: "*",
  });

  return upload;
};

const waitForThreeSeconds = () =>
  new Promise((resolve) => setTimeout(resolve, 3000));

const redirectToAsset = async (uploadId: string) => {
  let attempts = 0;
  while (attempts <= 10) {
    const upload = await mux.video.uploads.retrieve(uploadId);
    if (upload.asset_id) {
      redirect(`/asset/${upload.asset_id}`);
    } else {
      // while onSuccess is a strong indicator that Mux has received the file
      // and created the asset, this isn't a guarantee.
      // In production, you might listen for the video.upload.asset_created webhook
      // https://docs.mux.com/guides/listen-for-webhooks
      // To keep things simple here,
      // we'll just poll the API at an interval for a few seconds.
      await waitForThreeSeconds();
      attempts++;
    }
  }
  throw new Error("No asset_id found for upload");
};

// since we want to create a new upload for each visitor,
// we disable caching
export const dynamic = "force-dynamic";

export default async function Page() {
  const upload = await createUpload();

  return (
    <MuxUploader
      onSuccess={async () => {
        "use server";
        await redirectToAsset(upload.id);
      }}
      endpoint={upload.url}
    />
  );
}
