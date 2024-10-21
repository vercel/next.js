"use client";

import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";

function LoaderRo13({ time }: { time?: number }) {
  const [loading, setLoading] = useState(true);
  const controls = useAnimation();

  useEffect(() => {
    if (time !== -1) {
      const timer = setTimeout(() => {
        setLoading(false);
      }, time || 4000);
      return () => clearTimeout(timer);
    }
  }, [time]);

  useEffect(() => {
    if (loading) {
      controls.start({
        opacity: 1,
        transition: { duration: 1 },
      });
    } else {
      controls.start({
        opacity: 0,
        transition: { duration: 1 },
      });
    }
  }, [loading, controls]);

  return (
    <motion.div
      className="fixed h-screen top-0 left-0 w-full flex justify-center items-center z-10"
      animate={controls}
    >
      <div className="p-4 rounded-md">
        <div className="flex justify-center">
          <>
            <motion.span
              className="w-4 h-4 my-12 mx-1 bg-black dark:bg-white rounded-full"
              animate={{
                y: [0, -20, 0],
                opacity: [1, 0],
                transition: { duration: 1, repeat: time === -1 ? Infinity : 2 },
              }}
            />
            <motion.span
              className="w-4 h-4 my-12 mx-1 bg-black dark:bg-white rounded-full"
              animate={{
                y: [0, -20, 0],
                opacity: [1, 0],
                transition: {
                  duration: 1,
                  repeat: time === -1 ? Infinity : 1.8,
                  delay: 0.2,
                },
              }}
            />
            <motion.span
              className="w-4 h-4 my-12 mx-1 bg-black dark:bg-white rounded-full"
              animate={{
                y: [0, -20, 0],
                opacity: [1, 0],
                transition: {
                  duration: 1,
                  repeat: time === -1 ? Infinity : 1.6,
                  delay: 0.4,
                },
              }}
            />
          </>
        </div>
      </div>
    </motion.div>
  );
}

export default LoaderRo13;
