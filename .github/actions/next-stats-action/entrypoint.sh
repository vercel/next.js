#!/bin/bash
set -eu # stop on error

export HOME=/root

node /next-stats/src/index.js
