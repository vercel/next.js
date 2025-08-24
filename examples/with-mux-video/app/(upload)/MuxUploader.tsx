"use client";

import { type ComponentPropsWithoutRef } from "react";

import LibMuxUploader from "@mux/mux-uploader-react";

type Props = {
  endpoint: ComponentPropsWithoutRef<typeof LibMuxUploader>["endpoint"];
  onSuccess: () => void;
};
export default function MuxUploader({ endpoint, onSuccess }: Props) {
  return <LibMuxUploader endpoint={endpoint} onSuccess={() => onSuccess()} />;
}
