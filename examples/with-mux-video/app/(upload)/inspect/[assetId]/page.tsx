import Mux from "@mux/mux-node";
import { redirect } from "next/navigation";
import { Status } from "./types";
import AssetStatusPoll from "./AssetStatusPoll";

// reads MUX_TOKEN_ID and MUX_TOKEN_SECRET from your environment
const mux = new Mux();

const checkAssetStatus = async (assetId: string): Promise<Status> => {
  const asset = await mux.video.assets.retrieve(assetId);

  if (asset.status === "ready") {
    const playbackId = asset.playback_ids?.[0]?.id;
    if (playbackId) {
      redirect(`/view/${playbackId}`);
    }
  }

  return {
    status: asset.status,
    errors: asset.errors,
  };
};

export default async function Page({
  params: { assetId },
}: {
  params: { assetId: string };
}) {
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
