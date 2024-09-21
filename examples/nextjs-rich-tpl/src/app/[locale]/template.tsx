"use client";

import React from "react";
import { motion } from "framer-motion";

const variants = {
  hidden: { opacity: 0 },
  enter: { opacity: 1 },
};

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="w-full h-full min-h-[calc(100dvh-64px)]"
      variants={variants}
      initial="hidden"
      animate="enter"
      transition={{
        type: "linear",
        duration: 2,
      }}
    >
      {children}
    </motion.div>
  );
}
