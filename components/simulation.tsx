import Link from 'next/link';
import React from 'react';
import { Tour } from './use-tour';

function Simulation({ children }: { children?: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col">{children}</main>;
}

function Heading({
  title,
  tour,
  children,
}: {
  title: string;
  children?: React.ReactNode;
  tour?: Tour;
}) {
  return (
    <header className="bg-primary-500 flex w-full p-4 px-8 text-white">
      <h1 className="inline text-2xl">{title}</h1>
      {tour ? (
        <div className="ml-auto">
          <span>
            Currently at slide{' '}
            <span className="font-bold">{tour.index + 1}</span> out of{' '}
            <span className="font-bold">{tour.count}</span>
          </span>
          <button
            onClick={tour.open}
            type="button"
            className="relative mr-4 ml-4 cursor-pointer bg-slate-500 p-2 px-3 text-white before:absolute before:-inset-1 before:block before:w-0 before:bg-slate-700 before:transition-all hover:before:w-[calc(100%+8px)]"
          >
            <span className="relative">Continue Walkthrough</span>
          </button>
        </div>
      ) : (
        <></>
      )}
      {children}
    </header>
  );
}

function Main({ children }: { children?: React.ReactNode }) {
  return <div className="flex flex-grow flex-row flex-wrap">{children}</div>;
}

function Sidebar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-primary-100 text-primary-900 min-h-full w-96 p-8">
      {children}
    </div>
  );
}

function Footer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex w-full flex-row flex-wrap bg-slate-900 p-8 py-4 pb-6 text-slate-100">
      {children}
      <span className="block flex-grow"> </span>
      <Link href="/">Home</Link>
    </div>
  );
}

Simulation.Heading = Heading;
Simulation.Sidebar = Sidebar;
Simulation.Main = Main;
Simulation.Footer = Footer;

export { Simulation };
