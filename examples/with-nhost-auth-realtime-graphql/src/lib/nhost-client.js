"use client";
import { NhostClient } from "@nhost/react";
import nhostConfig from "./nhost-config";
import Cookies from "js-cookie";

export const nhost = new NhostClient({
  ...nhostConfig,
  clientStorageType: "custom",
  clientStorage: {
    setItem: (key, value) => {
      const x = Cookies.set(key, value, {
        expires: 30,
        sameSite: "lax",
        httpOnly: false,
      });
      console.log("setItem", key, value, x);
      return x;
    },
    getItem: (key) => {
      const x = Cookies.get(key);
      console.log("getItem", key, x);
      return x;
    },
    removeItem: (key) => {
      const x = Cookies.remove(key);
      console.log("removeItem", key, x);
      return x;
    },
  },
});
