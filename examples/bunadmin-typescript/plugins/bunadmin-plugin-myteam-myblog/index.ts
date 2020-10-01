import { IPluginData } from "@bunred/bunadmin"

export { default as post } from "./post"

const shared = {
  team: "myteam",
  group: "myblog",
  customized: true
}

export const initData: IPluginData[] = [
  {
    ...shared,
    id: "myteam_myblog_post",
    name: "post",
    label: "Post",
    icon_type: "eva",
    icon: "file-text-outline"
  }
]
