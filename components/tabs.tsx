'use client';

import { useId, useState } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ tabs, className }: { tabs: Tab[]; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={className}>
      <div role="tablist" className="flex flex-wrap gap-4">
        {tabs.map((t) => {
          const selected = t.id === current?.id;
          return (
            <button
              key={t.id}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              onClick={() => setActive(t.id)}
              className={`relative cursor-pointer p-2 px-3 before:absolute before:-inset-1 before:block before:w-0 before:transition-all hover:before:w-[calc(100%+8px)] ${
                selected
                  ? 'bg-primary-600 before:bg-primary-800 text-white'
                  : 'bg-slate-100 before:bg-slate-300'
              }`}
            >
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${current?.id}`}
        className="pt-4"
      >
        {current?.content}
      </div>
    </div>
  );
}
