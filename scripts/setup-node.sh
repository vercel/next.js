#!/bin/bash

# retry setting up Node.js version 5 times waiting 15 seconds between
for i in 1 2 3 4 5; 
  do curl -s https://install-node.vercel.app/v${NODE_VERSION} | FORCE=1 bash && break || sleep 15; 
done
