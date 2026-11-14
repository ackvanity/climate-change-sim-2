// Python bindings
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "compute.cpp"

namespace py = pybind11;

PYBIND11_MODULE(grid, m)
{
  m.doc() = "Bindings for simulation"; // optional module docstring

  py::class_<Simulation, std::shared_ptr<Simulation>>(m, "Simulation")
      .def(py::init<double, int>(), py::arg("dt") = 1e-3, py::arg("initial_alloc") = 10)
      .def("get_node", &Simulation::get_node)
      .def("build_matrix", &Simulation::build_matrix)
      .def("step", &Simulation::step)
      .def_readonly("V", &Simulation::V)
      .def_readonly("size", &Simulation::size)
      .def_readonly("dt", &Simulation::dt);

  py::class_<Resistor, std::shared_ptr<Resistor>>(m, "Resistor")
      .def(py::init<int, int, std::shared_ptr<Simulation>, double, bool>(), py::arg("node_A"), py::arg("node_B"), py::arg("simulation"), py::arg("RG"), py::arg("is_G") = false)
      .def_readonly("R", &Resistor::R)
      .def_readonly("G", &Resistor::G);

  py::class_<Battery, std::shared_ptr<Battery>>(m, "Battery")
      .def(py::init<int, int, std::shared_ptr<Simulation>, double, double>(), py::arg("node_A"), py::arg("node_B"), py::arg("simulation"), py::arg("V"), py::arg("G") = INF)
      .def_readonly("V", &Battery::V)
      .def_readonly("G", &Battery::G);

  py::class_<Capacitor, std::shared_ptr<Capacitor>>(m, "Capacitor")
      .def(py::init<int, int, std::shared_ptr<Simulation>, double>(), py::arg("node_A"), py::arg("node_B"), py::arg("simulation"), py::arg("C"))
      .def_readonly("C", &Capacitor::C)
      .def_readonly("G", &Capacitor::G);

  py::class_<Inductor, std::shared_ptr<Inductor>>(m, "Inductor")
      .def(py::init<int, int, std::shared_ptr<Simulation>, double>(), py::arg("node_A"), py::arg("node_B"), py::arg("simulation"), py::arg("L"))
      .def_readonly("L", &Inductor::L)
      .def_readonly("G", &Inductor::G);
}
