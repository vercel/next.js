"use client";

import { usePathname } from "next/navigation";

function useLocalePathname() {
  const pathname = usePathname();

  function RemoveSecondSlashSegment(path: string): string {
    // スラッシュで文字列を分割する
    const segments = path.split("/");

    // 分割した結果の長さが2以下なら最初のセグメントを返す
    if (segments.length <= 2) {
      return "/";
    }

    // 最初の空文字（先頭のスラッシュに対応）を含めずに再結合
    return "/" + segments.slice(2).join("/");
  }

  const res = RemoveSecondSlashSegment(pathname);

  return res;
}

export default useLocalePathname;
