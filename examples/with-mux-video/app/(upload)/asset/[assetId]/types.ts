import type Mux from "@mux/mux-node";

export type Status = {
  status: Mux.Video.Assets.Asset["status"];
  errors: Mux.Video.Assets.Asset["errors"];
};
