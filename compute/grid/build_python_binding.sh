#!/usr/bin/env bash
# Builds the `grid` Python module (pybind11) with a minimal KLU, compiled from source.
#
# Only the real-valued, 32-bit-index (int/double) KLU + AMD + COLAMD + BTF + SuiteSparse_config
# sources are compiled. Excluded on purpose:
#   - klu_l*/klu_z*/klu_zl*, amd_l*, btf_l*, colamd_l*  (long-index and complex variants)
#   - CHOLMOD (-DNCHOLMOD), the only KLU option that pulls in BLAS/LAPACK
# The same source list (SRCS) can be given to `emcc` for the WASM build; only the
# pybind11 part (python_bindings.cpp, last step) is Python-specific.
set -euo pipefail
cd "$(dirname "$0")"

SS=SuiteSparse
OUT=build
PYINC=$(python3 -c 'import sysconfig; print(sysconfig.get_paths()["include"])')
EXT=$(python3 -c 'import sysconfig; print(sysconfig.get_config_var("EXT_SUFFIX"))')

INCS="-I$SS/KLU/Include -I$SS/AMD/Include -I$SS/COLAMD/Include -I$SS/BTF/Include -I$SS/SuiteSparse_config"
CFLAGS="-O3 -fPIC -DNCHOLMOD $INCS"

# keep only the int/double variants
SRCS="$SS/SuiteSparse_config/SuiteSparse_config.c"
for f in $SS/KLU/Source/klu*.c $SS/AMD/Source/amd*.c $SS/COLAMD/Source/colamd*.c $SS/BTF/Source/btf*.c; do
  case "$(basename "$f")" in
    klu_l*|klu_z*|amd_l*|btf_l*|colamd_l.c) ;;
    *) SRCS="$SRCS $f" ;;
  esac
done

mkdir -p "$OUT"
OBJS=""
for f in $SRCS; do
  # prefix with the library folder so equal names cannot collide
  o="$OUT/$(basename "$(dirname "$(dirname "$f")")")_$(basename "${f%.c}").o"
  if [ ! -f "$o" ] || [ "$f" -nt "$o" ]; then
    cc $CFLAGS -c "$f" -o "$o"
  fi
  OBJS="$OBJS $o"
done

c++ -O3 -Wall -shared -std=c++17 -fPIC -DNCHOLMOD $INCS \
  -I"$PYINC" -Ipybind11/include \
  python_bindings.cpp $OBJS -o "grid$EXT"
echo "built grid$EXT"
