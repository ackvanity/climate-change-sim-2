import numpy as np

G = np.identity(10, dtype=np.float64) * 1e-6
I_hist = np.zeros([10])
V = np.zeros([10])
dt = 1e-3


class Component:
    def add(self):
        pass

    def remove(self):
        pass

    def compute(self):
        pass


class Resistor(Component):
    def __init__(self, A, B, R):
        self.A = A
        self.B = B
        self.G = 1 / R
        self.add()

    def add(self):
        G[self.A][self.A] += self.G
        G[self.A][self.B] -= self.G
        G[self.B][self.A] -= self.G
        G[self.B][self.B] += self.G

    def remove(self):
        G[self.A][self.A] -= self.G
        G[self.A][self.B] += self.G
        G[self.B][self.A] += self.G
        G[self.B][self.B] -= self.G


class Capacitor(Component):
    def __init__(self, A, B, C):
        self.I_hist = 0
        self.A = A
        self.B = B
        self.G = 2 * C / dt
        print(self.G)
        self.add()

    def add(self):
        G[self.A][self.A] += self.G
        G[self.A][self.B] -= self.G
        G[self.B][self.A] -= self.G
        G[self.B][self.B] += self.G

    def remove(self):
        G[self.A][self.A] -= self.G
        G[self.A][self.B] += self.G
        G[self.B][self.A] += self.G
        G[self.B][self.B] -= self.G

    def compute(self):
        self.I_hist = 2 * self.G * (V[self.A] - V[self.B]) - self.I_hist

        I_hist[self.A] = I_hist[self.A] + self.I_hist
        I_hist[self.B] = I_hist[self.B] - self.I_hist


class Inductor(Component):
    def __init__(self, A, B, L):
        self.I_hist = 0
        self.A = A
        self.B = B
        self.G = dt / (2 * L)
        print(self.G)
        self.add()

    def add(self):
        G[self.A][self.A] += self.G
        G[self.A][self.B] -= self.G
        G[self.B][self.A] -= self.G
        G[self.B][self.B] += self.G

    def remove(self):
        G[self.A][self.A] -= self.G
        G[self.A][self.B] += self.G
        G[self.B][self.A] += self.G
        G[self.B][self.B] -= self.G

    def compute(self):
        self.I_hist = self.I_hist - 2 * self.G * (V[self.A] - V[self.B])
        I_hist[self.A] = I_hist[self.A] + self.I_hist
        I_hist[self.B] = I_hist[self.B] - self.I_hist


class Battery(Component):
    def __init__(self, A, B, V, R=1e-5):
        self.A = A
        self.B = B
        self.V = V
        self.G = 1 / R
        self.add()

    def add(self):
        G[self.A][self.A] += self.G
        G[self.A][self.B] -= self.G
        G[self.B][self.A] -= self.G
        G[self.B][self.B] += self.G

    def remove(self):
        G[self.A][self.A] -= self.G
        G[self.A][self.B] += self.G
        G[self.B][self.A] += self.G
        G[self.B][self.B] -= self.G

    def compute(self):
        I_hist[self.A] = I_hist[self.A] + self.V * self.G
        I_hist[self.B] = I_hist[self.B] - self.V * self.G


components: list[Component] = []


def run():
    global I_hist, V
    I_hist = np.zeros([10])
    for component in components:
        component.compute()

    V = np.matmul(np.linalg.inv(G), I_hist)


import matplotlib.pyplot as plt

# Lists to store history for plotting
time_history = []
v_cap_history = []

# Reset components for a clean run
components.clear()
components.append(Battery(0, 1, 10))
components.append(Resistor(0, 2, 1))
components.append(Resistor(1, 3, 1))
components.append(Inductor(2, 3, 1))

# Run for 4 seconds (4 million steps, or fewer if you want a quicker test)
steps = int(4 / dt)  # 0.2 seconds for a quick test
for i in range(steps):
    run()
    time_history.append(i * dt)
    v_cap_history.append(V[2] - V[3])

    if i % 1000 == 0:
        print(V[2] - V[3])

plt.plot(time_history, v_cap_history, label="Capacitor Voltage")
plt.xlabel("Time (s)")
plt.ylabel("Voltage (V)")
plt.title("RC Circuit Transient Response")
plt.grid(True)
plt.legend()
plt.show()
