#!/usr/bin/env bash
# Compiles the table decoder/interpolator to WASM. Requires the Emscripten SDK (em++) on PATH.
# Output goes to public/wasm/greenhouse/, which Next.js serves statically (gitignored).
# The precomputed table itself is NOT compiled in: copy compute/greenhouse/precompute_bin/final_result.bin to
# public/data/greenhouse/final_result.bin (see compute/greenhouse/INTERFACE.md). Rebuild only if the table format or interpolation method changes.
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT=public/wasm/greenhouse
mkdir -p "$OUT"

em++ interface/greenhouse/src/greenhouse_wasm.cpp \
  -std=c++20 -O3 \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createGreenhouse \
  -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS=_gh_init,_gh_num_layers,_gh_table_bytes,_gh_domain,_gh_solve,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF64,HEAPU8 \
  -o "$OUT/greenhouse.js"

echo "Built $OUT/greenhouse.{js,wasm}"
