import React from 'react';
import { motion } from 'framer-motion';

const HeroAnimation = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -100 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="hero-animation"
    >
      <h1>Welcome to the Curious Cartography of Cognition</h1>
      <p>Explore the vast landscapes of knowledge and creativity.</p>
    </motion.div>
  );
};

export default HeroAnimation;
