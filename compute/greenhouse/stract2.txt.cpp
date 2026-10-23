int main()
{
  Species species("CO2");
  species.molar_mass_g_mol = 44.01;

  auto start = std::chrono::steady_clock::now();
  std::cout << "COMPUTING" << std::endl;
  auto result = computeCKD(species, 300, 1, 1);
  for (auto ckd : result.bins)
  {
    for (auto point : ckd.k)
    {
      std::cout << point << " ";
    }
    std::cout << std::endl;
  }

  auto end = std::chrono::steady_clock::now();
  auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

  std::cout << elapsed_ms.count() << std::endl;
}