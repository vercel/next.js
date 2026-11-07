import { FilterEnum } from "@/utils/enum";
import { listFiles } from "@/utils/imagekit";
import AssetDetail from "@/components/AssetDetail";
import { FileObject } from "imagekit/dist/libs/interfaces";

interface AssetDetailProps {
  params: {
    assetId: string;
  };
}

export async function generateStaticParams() {
  const images = (await listFiles(100, 0, FilterEnum.ALL)) as FileObject[];

  return images.map((image) => ({
    assetId: image.fileId,
  }));
}

export default async function AssetPage({ params }: AssetDetailProps) {
  const { assetId } = await params;
  const images = (await listFiles(100, 0, FilterEnum.ALL)) as FileObject[];
  return <AssetDetail images={images} assetId={assetId} />;
}