import withLinaria, { LinariaConfig } from "next-with-linaria";

const config: LinariaConfig = {
  // ...your next.js config
  linaria: {
    // Linaria options here
  },
};

export default withLinaria(config);
