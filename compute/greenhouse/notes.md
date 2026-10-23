notes:

1. Use the Faddeeva function
2. Try the Tepper-Garcia function instead
3. Wrong range, use a simplified version of equation 17b described in the article "A Two-Domain MATLAB Implementation for Efficient Computation of the Voigt/Complex Error Function" (published at MDPI). The interpolation section is replaced by calling the faddeeva function header. Accuracy remains to be seen.
4. Started adding multithreaded
5. Took 4 hours on an i5-13420H with 12 cores at 3.5-4.2 GHz (not only did the CPU hold back to 4 GHz, but I did psst... play Snufkin: Melody of Moominvalley while the code runs. I think it used up a bunch of power meant for the CPU cores)

idea:

1. Use SMID and add taper garcia approximation too for small y regimes
