import { Simulation } from '@/components/simulation';

export default function Climate() {
  return (
    <Simulation>
      <Simulation.Heading title="Thermodynamics of Climate Change"></Simulation.Heading>
      <Simulation.Main>
        <Simulation.Sidebar></Simulation.Sidebar>
      </Simulation.Main>
      <Simulation.Footer></Simulation.Footer>
    </Simulation>
  );
}
