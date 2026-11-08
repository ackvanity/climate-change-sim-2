#!/usr/bin/env bash
# Compiles the urban cell-grid solver (compute/urban/compute.cpp) plus its C ABI (src/urban_wasm.cpp) to WASM.
# Requires the Emscripten SDK (em++) on PATH. Output goes to public/wasm/urban/, which Next.js serves statically (gitignored).
# The heat-transfer table is NOT compiled in: copy compute/urban/precompute_bin_urban/heat_transfer_rate.bin to
# public/data/urban/heat_transfer_rate.bin (see interface/urban/README.md). Rebuild whenever compute/urban changes.
#
# Flags that exist only because compute.cpp / urban.h are written for GCC and glibc:
#   -Iinterface/urban/shim  provides <bits/stdc++.h>, which Emscripten's libc++ does not have
#   -Duint=unsigned          `uint` is a glibc typedef, not standard C++ (urban.h could say `unsigned` instead)
#
# The two sources are compiled separately because only the solver may use -ffast-math. With it, std::isfinite() is
# folded to `true`, which would blind the wrapper's check for a diverged run (ur_stats counts non-finite cells).
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT=public/wasm/urban
mkdir -p "$OUT"
OBJ="$(mktemp -d)"
trap 'rm -rf "$OBJ"' EXIT

COMMON=(-std=c++20 -O3 -Iinterface/urban/shim -Duint=unsigned)

em++ "${COMMON[@]}" -c compute/urban/compute.cpp -ffast-math -o "$OBJ/compute.o"
em++ "${COMMON[@]}" -c interface/urban/src/urban_wasm.cpp -o "$OBJ/urban_wasm.o"

em++ "$OBJ/compute.o" "$OBJ/urban_wasm.o" \
  -O3 \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createUrban \
  -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS=_ur_table_ptr,_ur_table_bytes,_ur_create,_ur_destroy,_ur_step,_ur_set_params,_ur_set_gases,_ur_set_hour,_ur_hour,_ur_rows,_ur_cols,_ur_type_count,_ur_type_name,_ur_type_color,_ur_type_hot,_ur_cell,_ur_paint,_ur_fill,_ur_fill_temperature,_ur_load_types,_ur_read_types,_ur_stats,_ur_render,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF64,HEAPU8,UTF8ToString \
  -o "$OUT/urban.js"

echo "Built $OUT/urban.{js,wasm}"
