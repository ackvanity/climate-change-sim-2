import Image from 'next/image';
import Link, { LinkProps } from 'next/link';
import React from 'react';

function Collapsible({
  heading,
  children,
  className,
}: {
  heading: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section>
      <h3 className="mb-8 text-4xl font-bold">{heading}</h3>
      <div className={className}>{children}</div>
    </section>
  );
}

function Card({
  hero,
  title,
  children,
  writeup,
  simulation,
}: {
  hero?: React.ReactNode;
  children: React.ReactNode;
  title: string;
  writeup?: LinkProps['href'];
  simulation?: LinkProps['href'];
}) {
  return (
    <div className="aspect-3/4 w-96 bg-slate-100 transition-all hover:bg-slate-200">
      <div className="relative aspect-4/3 w-full bg-slate-400">{hero}</div>
      <div className="m-8 pb-2">
        <h4 className="text-lg font-bold">{title}</h4>
        {children}
        <div className="mt-6 flex w-full flex-row flex-wrap justify-between pb-4">
          {writeup ? (
            <span className="relative m-2 ms-0 p-2 before:absolute before:-inset-1 before:-ms-0 before:block before:w-0 before:bg-slate-300 before:transition-all hover:before:w-[calc(100%+8px)]">
              <Link className="relative" href={writeup}>
                Read Writeup
              </Link>
            </span>
          ) : (
            <span className="block"></span>
          )}
          {simulation && (
            <span className="relative m-2 me-0 bg-slate-500 p-2 text-white before:absolute before:-inset-1 before:-ms-0 before:block before:w-0 before:bg-slate-700 before:transition-all hover:before:w-[calc(100%+8px)]">
              <Link className="relative" href={simulation}>
                Start Simulation
              </Link>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="flex h-screen w-full flex-col justify-center">
        <h1 className="w-full text-center text-6xl">Climate Change</h1>
        <p className="mx-auto mt-12 w-full max-w-96 text-center text-lg">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Minima
          accusantium est, eum, ut eaque id totam, culpa dolores inventore quod
          incidunt necessitatibus voluptates unde? Mollitia aut inventore
          repellendus minima esse?
        </p>
      </header>
      <main className="w-full px-32">
        <h2 className="mb-16 text-center text-5xl">Simulations</h2>
        <Collapsible heading="Introductory" className="flex flex-row flex-wrap">
          <Card
            title="Thermodynamics of Climate Change"
            simulation="/simulations/climate"
          >
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit.
              Perferendis, laborum repellendus itaque sed expedita optio
              adipisci officia similique iste earum molestiae cupiditate, beatae
              assumenda, eius necessitatibus rem ipsa! Vero, possimus!
            </p>
          </Card>
        </Collapsible>
      </main>
      <footer className="w-full px-32">
        <p className="text-center">
          Created by{' '}
          <a
            href="https://ackhava.dev"
            className="relative inline-block font-bold before:absolute before:-inset-1 before:box-content before:block before:h-full before:w-0 before:border-b-3 before:border-b-[#F58B56] before:transition-all before:duration-300 after:absolute after:-inset-1 after:z-[-1] after:box-border after:block after:h-full after:w-0 after:border-b-5 after:border-b-[#F58B56] after:transition-all after:duration-300 hover:before:w-full hover:after:w-full"
          >
            <span className="relative">Ackhava Adam Malonda</span>
          </a>{' '}
          in 2026.
        </p>
        <p>Links</p>
      </footer>
    </>
  );
}
