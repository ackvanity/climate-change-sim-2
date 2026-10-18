import os
from hapi import *
import struct

# Initialization
db_dir = "hitran"


class Physics:
    h = 6.62607015e-34
    c = 299792458
    kB = 1.380649e-23
    atm = 101325


# Gases
gases = {"H2O": 1, "CO2": 2, "O3": 3, "N2O": 4, "CH4": 6}

if __name__ == "__main__":
    db_begin(db_dir)
    for name, gas_id in gases.items():
        data = os.path.join(db_dir, f"{name}.data")
        if os.path.exists(data):
            print(f"Line parameters for {name} already downloaded.")
            continue

        print(f"Downloading line parameters for {name}...")
        fetch(name, gas_id, 1, 200, 2000)

    def export_data(name):
        T_range = np.linspace(1, 400, 400)
        q_values = partitionSum(gases[name], 1, T_range.tolist())

        nu = getColumn(name, "nu")
        sw = getColumn(name, "sw")
        gamma_air = getColumn(name, "gamma_air")
        gamma_self = getColumn(name, "gamma_self")
        elower = getColumn(name, "elower")
        n_air = getColumn(name, "n_air")

        num_lines = len(nu)

        filename = f"{name}_Q.bin"
        with open(filename, "wb") as f:
            for q in q_values:
                f.write(struct.pack("d", q))

        print(f"Wrote {len(q_values)} Q-values for {name} to {filename}")

        filename = f"{name}_lines.bin"
        with open(filename, "wb") as f:
            f.write(struct.pack("Q", num_lines))

            for row in zip(nu, sw, gamma_air, gamma_self, elower, n_air):
                f.write(struct.pack("dddddd", *row))

        print(f"Wrote {num_lines} lines for {name} to {filename}")

    for gas in gases.keys():
        export_data(gas)

    # Generate 16-point Gauss-Legendre nodes and weights on [-1, 1]
    nodes, weights = np.polynomial.legendre.leggauss(16)

    # Map from [-1, 1] to [0, 1] for Correlated-k CDF space
    g_nodes = (nodes + 1.0) / 2.0
    g_weights = weights / 2.0

    print("==== EXPORT DONE ====")
    print(
        "Copy the following configuration lines to config.h in the Config namespace if not already present to generate the CKD points"
    )

    # Print out ready-to-paste C++ constexpr arrays
    print("constexpr double G_NODES[16] = {")
    for val in g_nodes:
        print(f"    {val:.16f},")
    print("};")

    print("\nconstexpr double G_WEIGHTS[16] = {")
    for val in g_weights:
        print(f"    {val:.16f},")
    print("};")
