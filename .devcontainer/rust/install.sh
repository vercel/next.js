#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

curl -L --proto '=https' --tlsv1.2 -sSf \
  https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh \
  | bash
cargo binstall cargo-nextest --secure

apt-get update
apt-get -y install --no-install-recommends libfontconfig1-dev
