import Mux from "@mux/mux-node";
import { redirect } from "next/navigation";
import { Status } from "./types";
import AssetStatusPoll from "./AssetStatusPoll";

// reads MUX_TOKEN_ID and MUX_TOKEN_SECRET from your environment
const mux = new Mux();

const checkAssetStatus = async (assetId: string): Promise<Status> => {
  const asset = await mux.video.assets.retrieve(assetId);

  // if the asset is ready and it has a public playback ID,
  // (which it should, considering the upload settings we used)
  // redirect to its playback page
  if (asset.status === "ready") {
    const playbackIds = asset.playback_ids;
    if (Array.isArray(playbackIds)) {
      const playbackId = playbackIds.find((id) => id.policy === "public");
      if (playbackId) {
        redirect(`/v/${playbackId.id}`);
      }
    }
  }

  return {
    status: asset.status,
    errors: asset.errors,
  };
};

// For better performance, we could cache and use a Mux webhook to invalidate the cache.
// https://docs.mux.com/guides/listen-for-webhooks
// For this example, calling the Mux API on each request and then polling is sufficient.
export const dynamic = "force-dynamic";

export default async function Page(props: {
  params: Promise<{ assetId: string }>;
}) {
  const params = await props.params;

  const { assetId } = params;

  const initialStatus = await checkAssetStatus(assetId);
  return (
    <AssetStatusPoll
      initialStatus={initialStatus}
      checkAssetStatus={async () => {
        "use server";
        return await checkAssetStatus(assetId);
      }}
    />
  );
}
