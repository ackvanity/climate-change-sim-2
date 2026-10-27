// Stand-in for the WASM solver while Greenhouse::solve_state is unfinished (it currently returns no values)
// and the Emscripten build has not been run. Same contract as Greenhouse.solve(), so the UI cannot tell the
// difference. This is a textbook parametrisation (log CO2 forcing, sqrt CH4 forcing, fixed lapse rate), NOT
// the radiative-equilibrium physics in compute/greenhouse.

import { NUM_LAYERS, layerAltitudesKm, type Greenhouse } from './greenhouse';

const PREINDUSTRIAL_CO2_PPM = 280;
const PREINDUSTRIAL_CH4_PPM = 0.7;
const BASE_SURFACE_K = 288;
const SENSITIVITY_K_PER_WM2 = 0.8;
const LAPSE_K_PER_KM = 6.5;

export const mockGreenhouse: Greenhouse = {
  solve(co2Ppm, ch4Ppm) {
    const co2Forcing =
      5.35 * Math.log(Math.max(co2Ppm, 1) / PREINDUSTRIAL_CO2_PPM);
    const ch4Forcing =
      0.036 *
      (Math.sqrt(Math.max(ch4Ppm, 0) * 1000) -
        Math.sqrt(PREINDUSTRIAL_CH4_PPM * 1000));
    const surface =
      BASE_SURFACE_K + SENSITIVITY_K_PER_WM2 * (co2Forcing + ch4Forcing);

    // More CO2 cools the stratosphere while warming the surface.
    const tropopauseKm =
      11 + 0.4 * Math.log2(Math.max(co2Ppm, 1) / PREINDUSTRIAL_CO2_PPM);
    const stratosphereOffset =
      -1.5 * Math.log2(Math.max(co2Ppm, 1) / PREINDUSTRIAL_CO2_PPM);
    const tropopauseK = surface - LAPSE_K_PER_KM * tropopauseKm;

    const out = new Float64Array(NUM_LAYERS + 1);
    layerAltitudesKm.forEach((z, i) => {
      out[i] =
        z <= tropopauseKm
          ? surface - LAPSE_K_PER_KM * z
          : tropopauseK +
            stratosphereOffset +
            1.0 * Math.min(Math.max(z - 20, 0), 30) +
            0.2 * Math.max(z - 50, 0);
    });
    out[NUM_LAYERS] = surface;
    return out;
  },
};
