import Link from 'next/link';
import React from 'react';

function Simulation({ children }: { children?: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col">{children}</main>;
}

function Heading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="bg-primary-500 p-4 px-8 text-white">
      <h1 className="text-2xl">{title}</h1>
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
