#include <bits/stdc++.h>

const int ROWS = 500;
const int COLS = 500;

struct CellData_Hot
{
  double albedo;
  double k_surface;
  double k_lateral;
  double heat_capacity;
};

struct Color
{
  std::uint16_t R, G, B;
  std::uint16_t A = 255U;
};

struct CellData_Cold
{
  std::string name;
  Color color;
};

struct cell
{
  double T;
  int type;
};

int main()
{
}