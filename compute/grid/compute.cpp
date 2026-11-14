#include <bits/stdc++.h>
#include "SuiteSparse/KLU/Include/klu.h"

const double EPS = 1e-6; // minimum possible value of G. If the value of G is below this, will be zeroed
const double INF = 1e6;

struct Simulation
{
  struct _Component
  {
    int id;
    void add_mat(std::map<std::pair<int, int>, double> &matrix);
  };

  struct _Resistor : public _Component
  {
    int node_A, node_B;
    double G;

    void add_mat(std::map<std::pair<int, int>, double> &matrix)
    {
      matrix[{node_A, node_A}] += G;
      matrix[{node_A, node_B}] -= G;
      matrix[{node_B, node_A}] -= G;
      matrix[{node_B, node_B}] += G;
    }
  };

  struct _Battery : public _Component
  {
    int node_A, node_B;
    double V;
    double G = INF;

    void add_mat(std::map<std::pair<int, int>, double> &matrix)
    {
      matrix[{node_A, node_A}] += G;
      matrix[{node_A, node_B}] -= G;
      matrix[{node_B, node_A}] -= G;
      matrix[{node_B, node_B}] += G;
    }

    void compute(Simulation *simulation)
    {
      simulation->I_hist[node_A] += V * G;
      simulation->I_hist[node_B] -= V * G;
    }
  };

  // Trapezoidal companion model: conductance G plus a history current source I_state
  // injected into node_A (and withdrawn from node_B), updated every step from the previous V.
  struct _Capacitor : public _Component
  {
    int node_A, node_B;
    double G;           // 2C / dt
    double I_state = 0; // history current

    void add_mat(std::map<std::pair<int, int>, double> &matrix)
    {
      matrix[{node_A, node_A}] += G;
      matrix[{node_A, node_B}] -= G;
      matrix[{node_B, node_A}] -= G;
      matrix[{node_B, node_B}] += G;
    }

    void compute(Simulation *simulation)
    {
      I_state = 2 * G * (simulation->V[node_A] - simulation->V[node_B]) - I_state;
      simulation->I_hist[node_A] += I_state;
      simulation->I_hist[node_B] -= I_state;
    }
  };

  struct _Inductor : public _Component
  {
    int node_A, node_B;
    double G;           // dt / (2L)
    double I_state = 0; // history current

    void add_mat(std::map<std::pair<int, int>, double> &matrix)
    {
      matrix[{node_A, node_A}] += G;
      matrix[{node_A, node_B}] -= G;
      matrix[{node_B, node_A}] -= G;
      matrix[{node_B, node_B}] += G;
    }

    void compute(Simulation *simulation)
    {
      I_state = I_state - 2 * G * (simulation->V[node_A] - simulation->V[node_B]);
      simulation->I_hist[node_A] += I_state;
      simulation->I_hist[node_B] -= I_state;
    }
  };

  double dt;

  int max_id = 0;
  bool modified = false;
  std::vector<_Resistor> resistors;
  std::vector<_Battery> batteries;
  std::vector<_Capacitor> capacitors;
  std::vector<_Inductor> inductors;

  std::vector<double> V;
  std::vector<double> I_hist;
  std::queue<int> free_node;
  int size;

  klu_common Common;
  klu_symbolic *Symbolic = nullptr;
  klu_numeric *Numeric = nullptr;

  std::vector<int> Ap;
  std::vector<int> Ai;
  std::vector<double> Ax;

  void build_matrix()
  {
    modified = false;
    klu_free_numeric(&Numeric, &Common);
    klu_free_symbolic(&Symbolic, &Common);
    std::map<std::pair<int, int>, double> matrix;
    Ap.clear();
    Ai.clear();
    Ax.clear();

    Ap.push_back(0);

    for (int i = 0; i < size; i++)
      matrix[{i, i}] = 0;

    for (auto &r : resistors)
    {
      r.add_mat(matrix);
    }
    for (auto &b : batteries)
    {
      b.add_mat(matrix);
    }
    for (auto &c : capacitors)
    {
      c.add_mat(matrix);
    }
    for (auto &l : inductors)
    {
      l.add_mat(matrix);
    }

    for (int i = 0; i < size; i++)
    {
      for (int j = 0; j < size; j++)
      {
        if (!matrix.count({i, j}))
          continue;
        if (abs(matrix[{i, j}]) < (EPS * EPS) && (i != j))
          continue;

        if (i == j)
        {
          matrix[{i, j}] = std::max(0.0, matrix[{i, j}]);
        }
        else
        {
          matrix[{i, j}] = matrix[{i, j}];
        }
        Ai.push_back(j);
        Ax.push_back(matrix[{i, j}] + ((i == j) ? EPS : 0));
      }
      Ap.push_back(Ai.size());
    }

    Symbolic = klu_analyze(size, Ap.data(), Ai.data(), &Common);
    Numeric = klu_factor(Ap.data(), Ai.data(), Ax.data(), Symbolic, &Common);
    if (!Symbolic || !Numeric)
      throw std::runtime_error("KLU factorization failed (singular matrix?)");
  }

  void step()
  {
    if (modified || !Numeric)
      build_matrix();
    std::fill(I_hist.begin(), I_hist.end(), 0);

    // Invoke each component

    // Resistors have no injection

    // Batteries
    for (auto &b : batteries)
    {
      b.compute(this);
    }

    // Capacitors and inductors (history terms from the previous V)
    for (auto &c : capacitors)
    {
      c.compute(this);
    }
    for (auto &l : inductors)
    {
      l.compute(this);
    }

    klu_solve(Symbolic, Numeric, size, 1, I_hist.data(), &Common);

    std::swap(I_hist, V);
  }

  Simulation(double dt = 1e-3, int initial_alloc = 10)
  {
    klu_defaults(&Common);
    size = initial_alloc;
    V.resize(initial_alloc, 0);
    I_hist.resize(initial_alloc, 0);
    for (int i = 0; i < initial_alloc; i++)
      free_node.push(i);
    this->dt = dt;
  }

  void grow(int new_size)
  {
    new_size = std::max(new_size, size);
    if (new_size == size)
      return;
    for (int i = size; i < new_size; i++)
    {
      free_node.push(i);
    }
    size = new_size;
    modified = true;
    V.resize(size, 0);
    I_hist.resize(size, 0);
  }

  int get_node()
  {
    if (!free_node.size())
    {
      grow(size + std::max(10, size / 10));
    }

    assert(free_node.size());
    auto node = free_node.front();
    free_node.pop();
    return node;
  }

  ~Simulation()
  {
    klu_free_numeric(&Numeric, &Common);
    klu_free_symbolic(&Symbolic, &Common);
  }
};

struct Resistor
{
  std::shared_ptr<Simulation> simulation;

  int node_A, node_B;
  int id;
  double R;
  double G;

  Resistor(int node_A, int node_B, std::shared_ptr<Simulation> simulation, double RG, bool is_G = false)
  {
    if (is_G)
    {
      this->R = 1 / RG;
      this->G = RG;
    }
    else
    {
      this->G = 1 / RG;
      this->R = RG;
    }
    this->node_A = node_A;
    this->node_B = node_B;
    this->simulation = simulation;
    this->id = ++simulation->max_id;

    simulation->resistors.emplace_back();
    simulation->resistors.back().G = G;
    simulation->resistors.back().id = this->id;
    simulation->resistors.back().node_A = this->node_A;
    simulation->resistors.back().node_B = this->node_B;
    simulation->modified = true;
  }

  ~Resistor()
  {
    for (int i = 0; i < simulation->resistors.size(); i++)
    {
      if (simulation->resistors[i].id == id)
      {
        std::swap(simulation->resistors[i], simulation->resistors.back());
        break;
      }
    }
    assert(simulation->resistors.back().id == id);
    simulation->resistors.pop_back();
    simulation->modified = true;
  }
};

struct Battery
{
  std::shared_ptr<Simulation> simulation;

  int node_A, node_B;
  int id;
  double V;
  double G;

  Battery(int node_A, int node_B, std::shared_ptr<Simulation> simulation, double V, double G = INF)
  {
    this->node_A = node_A;
    this->node_B = node_B;
    this->simulation = simulation;
    this->V = V;
    this->G = G;
    this->id = ++simulation->max_id;

    simulation->batteries.emplace_back();
    simulation->batteries.back().G = G;
    simulation->batteries.back().V = V;
    simulation->batteries.back().id = this->id;
    simulation->batteries.back().node_A = this->node_A;
    simulation->batteries.back().node_B = this->node_B;
    simulation->modified = true;
  }

  ~Battery()
  {
    for (int i = 0; i < simulation->batteries.size(); i++)
    {
      if (simulation->batteries[i].id == id)
      {
        std::swap(simulation->batteries[i], simulation->batteries.back());
        break;
      }
    }
    assert(simulation->batteries.back().id == id);
    simulation->batteries.pop_back();
    simulation->modified = true;
  }
};

struct Capacitor
{
  std::shared_ptr<Simulation> simulation;

  int node_A, node_B;
  int id;
  double C;
  double G;

  Capacitor(int node_A, int node_B, std::shared_ptr<Simulation> simulation, double C)
  {
    this->node_A = node_A;
    this->node_B = node_B;
    this->simulation = simulation;
    this->C = C;
    this->G = 2 * C / simulation->dt;
    this->id = ++simulation->max_id;

    simulation->capacitors.emplace_back();
    simulation->capacitors.back().G = G;
    simulation->capacitors.back().id = this->id;
    simulation->capacitors.back().node_A = this->node_A;
    simulation->capacitors.back().node_B = this->node_B;
    simulation->modified = true;
  }

  ~Capacitor()
  {
    for (int i = 0; i < simulation->capacitors.size(); i++)
    {
      if (simulation->capacitors[i].id == id)
      {
        std::swap(simulation->capacitors[i], simulation->capacitors.back());
        break;
      }
    }
    assert(simulation->capacitors.back().id == id);
    simulation->capacitors.pop_back();
    simulation->modified = true;
  }
};

struct Inductor
{
  std::shared_ptr<Simulation> simulation;

  int node_A, node_B;
  int id;
  double L;
  double G;

  Inductor(int node_A, int node_B, std::shared_ptr<Simulation> simulation, double L)
  {
    this->node_A = node_A;
    this->node_B = node_B;
    this->simulation = simulation;
    this->L = L;
    this->G = simulation->dt / (2 * L);
    this->id = ++simulation->max_id;

    simulation->inductors.emplace_back();
    simulation->inductors.back().G = G;
    simulation->inductors.back().id = this->id;
    simulation->inductors.back().node_A = this->node_A;
    simulation->inductors.back().node_B = this->node_B;
    simulation->modified = true;
  }

  ~Inductor()
  {
    for (int i = 0; i < simulation->inductors.size(); i++)
    {
      if (simulation->inductors[i].id == id)
      {
        std::swap(simulation->inductors[i], simulation->inductors.back());
        break;
      }
    }
    assert(simulation->inductors.back().id == id);
    simulation->inductors.pop_back();
    simulation->modified = true;
  }
};
