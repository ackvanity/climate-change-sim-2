#!/usr/bin/env bash
# Compiles the greenhouse solver + precomputed tables to WASM. Requires the Emscripten SDK (emcc) on PATH.
# Output goes to public/wasm/greenhouse/, which Next.js serves statically (gitignored).
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT=public/wasm/greenhouse
mkdir -p "$OUT"

# --preload-file packs the tables into greenhouse.data, mounted in the virtual FS at the paths the C++ expects.
# Dependencies are reached through the symlinks in compute/greenhouse (which point into dependencies/).
emcc interface/greenhouse/src/greenhouse_wasm.cpp compute/greenhouse/Faddeeva.cc \
  -I compute/greenhouse \
  -std=c++20 -O3 -fexceptions \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createGreenhouse \
  -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS=_gh_init,_gh_num_layers,_gh_solve,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF64 \
  --preload-file compute/greenhouse/precompute_bin@precompute_bin \
  --preload-file compute/greenhouse/afgl-1986/1f.csv@afgl-1986/1f.csv \
  -o "$OUT/greenhouse.js"

echo "Built $OUT/greenhouse.{js,wasm,data}"
