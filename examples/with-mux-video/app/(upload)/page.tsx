import Mux from "@mux/mux-node";
import MuxUploader from "./MuxUploader";
import { redirect } from "next/navigation";

// reads MUX_TOKEN_ID and MUX_TOKEN_SECRET from your environment
const mux = new Mux();

const createUpload = async () => {
  const upload = await mux.video.uploads.create({
    new_asset_settings: { playback_policy: ["public"] },
    cors_origin: "*",
    test: true,
  });

  return upload;
};

const redirectToAsset = async (uploadId: string) => {
  const upload = await mux.video.uploads.retrieve(uploadId);
  if (upload.asset_id) {
    redirect(`/inspect/${upload.asset_id}`);
  } else {
    throw new Error("No asset_id found for upload");
  }
};

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
