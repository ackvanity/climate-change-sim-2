// Stand-in for GCC's <bits/stdc++.h>, which Emscripten's libc++ does not ship. compute/urban/compute.cpp includes it;
// the WASM build puts this directory on the include path (build.sh) so that file compiles unchanged.
#pragma once
#include <algorithm>
#include <array>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <memory>
#include <numeric>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
