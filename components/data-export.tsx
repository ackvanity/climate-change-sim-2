'use client';

import { useExport, type ExportColumn } from './use-export';

/**
 * Sidebar block with CSV and Excel download buttons for a simulation's whole dataset (every recorded property,
 * not only what a chart shows). Put it last in `Simulation.Sidebar`. `rows` may be a getter so the data is
 * built only when a button is clicked.
 */
export function DataExport<R>({
  rows,
  columns,
  filename,
  sheetName = 'Data',
  description,
}: {
  rows: readonly R[] | (() => readonly R[]);
  columns: readonly ExportColumn<R>[];
  /** File name without extension. */
  filename: string;
  sheetName?: string;
  /** Short note on what the file contains. */
  description?: React.ReactNode;
}) {
  const download = useExport(rows, columns, { filename, sheetName });
  return (
    <section className="mb-10">
      <h2 className="mb-6 text-xl">Download data</h2>
      {description && <p className="mb-4 text-sm">{description}</p>}
      <div className="flex flex-wrap gap-3">
        {(['csv', 'xlsx'] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => download(format)}
            className="bg-primary-600 before:bg-primary-800 relative cursor-pointer p-2 px-3 text-white before:absolute before:-inset-1 before:block before:w-0 before:transition-all hover:before:w-[calc(100%+8px)]"
          >
            <span className="relative">
              {format === 'csv' ? 'CSV' : 'Excel (.xlsx)'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
