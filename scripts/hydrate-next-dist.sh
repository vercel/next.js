#!/usr/bin/env bash
# Populates packages/next/dist (and packages/next-env/dist, which the
# workspace `next` package resolves via its `@next/env` dependency) from
# published tarballs instead of building locally. Used by deploy tests, which
# deploy the published NEXT_TEST_VERSION anyway and only need dist for the
# local test harness (e.g. `next/dist/trace` imports in test/lib).
set -euo pipefail

version="${1:?usage: hydrate-next-dist.sh <version|dist-tag|tarball-url>}"

case "$version" in
  http*) next_spec="$version" ;;
  *) next_spec="next@$version" ;;
esac

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Extracts the published tarball for $1 into a fresh directory, moves its
# dist/ to $2, and leaves the extracted package dir path in $extracted_pkg.
hydrate() {
  local spec="$1"
  local dest="$2"
  local pkgdir tarball
  pkgdir="$(mktemp -d "$tmpdir/pkg.XXXXXX")"
  tarball="$(cd "$pkgdir" && npm pack "$spec" --silent | tail -n1)"
  tar -xzf "$pkgdir/$tarball" -C "$pkgdir" package
  rm -rf "$dest"
  mv "$pkgdir/package/dist" "$dest"
  extracted_pkg="$pkgdir/package"
  echo "hydrated $dest from $spec"
}

hydrate "$next_spec" packages/next/dist

# `@next/env` is a workspace dependency of `next`; resolve the exact version
# from the packed `next` package so it also works for tarball URLs.
next_env_version="$(node -e "console.log(require(process.argv[1]).dependencies['@next/env'])" "$extracted_pkg/package.json")"
hydrate "@next/env@$next_env_version" packages/next-env/dist
