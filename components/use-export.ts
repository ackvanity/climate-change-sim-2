'use client';

import { useCallback, useEffect, useRef } from 'react';

/** A spreadsheet cell. `null`, `undefined` and non-finite numbers export as empty cells. */
export type ExportCell = number | string | null | undefined;

export interface ExportColumn<R> {
  /** Header text. */
  label: string;
  /** Appended to the header in parentheses, e.g. `Temperature (K)`. */
  unit?: string;
  /** Row field to read, or a function computing the cell from the row. */
  value: keyof R | ((row: R) => ExportCell);
}

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportOptions {
  /** File name without extension. Default `export`. */
  filename?: string;
  /** Worksheet name in the `.xlsx` (Excel allows at most 31 characters, none of `\ / ? * [ ] :`). */
  sheetName?: string;
}

/**
 * Turns a list of rows plus column descriptions into a download. Returns a stable callback; call it with
 * `'csv'` or `'xlsx'` from your own button. `rows` may be a function (e.g. `() => history.current`) so the
 * data is read only at click time and the caller need not re-render to keep it fresh.
 */
export function useExport<R>(
  rows: readonly R[] | (() => readonly R[]),
  columns: readonly ExportColumn<R>[],
  options: ExportOptions = {}
): (format: ExportFormat) => void {
  const latest = useRef({ rows, columns, options });
  useEffect(() => {
    latest.current = { rows, columns, options };
  });

  return useCallback((format: ExportFormat) => {
    const { rows, columns, options } = latest.current;
    const table = toTable(typeof rows === 'function' ? rows() : rows, columns);
    const name = options.filename ?? 'export';
    if (format === 'csv')
      download(
        new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' }),
        `${name}.csv`
      );
    else
      download(
        new Blob([toXlsx(table, options.sheetName ?? 'Sheet1')], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${name}.xlsx`
      );
  }, []);
}

// ---- Table -------------------------------------------------------------------------------------------------

interface Table {
  header: string[];
  body: ExportCell[][];
}

function toTable<R>(
  rows: readonly R[],
  columns: readonly ExportColumn<R>[]
): Table {
  return {
    header: columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label)),
    body: rows.map((row) =>
      columns.map((c) =>
        typeof c.value === 'function'
          ? c.value(row)
          : (row[c.value] as ExportCell)
      )
    ),
  };
}

/** Empty for missing or non-finite values; numbers at full precision. */
function cellText(v: ExportCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return v;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- CSV (RFC 4180) ----------------------------------------------------------------------------------------

function toCsv({ header, body }: Table): string {
  const field = (s: string) =>
    /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const line = (cells: ExportCell[]) =>
    cells.map((c) => field(cellText(c))).join(',');
  // The BOM makes Excel read the file as UTF-8 (units such as °C).
  return '﻿' + [line(header), ...body.map(line)].join('\r\n') + '\r\n';
}

// ---- XLSX ----------------------------------------------------------------------------------------------------
// The smallest workbook Excel, LibreOffice and Google Sheets accept: five XML parts in an uncompressed zip.
// Strings are inline (no shared-string table); the header row is bold and frozen.

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab/newline are not allowed in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
function columnName(i: number): string {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function sheetXml({ header, body }: Table): string {
  const cell = (v: ExportCell, ref: string, style: string) => {
    if (typeof v === 'number')
      return Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : '';
    if (v == null || v === '') return '';
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
  };
  const row = (cells: ExportCell[], r: number, style = '') =>
    `<row r="${r}">${cells.map((v, c) => cell(v, `${columnName(c)}${r}`, style)).join('')}</row>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetData>' +
    row(header, 1, ' s="1"') +
    body.map((cells, i) => row(cells, i + 2)).join('') +
    '</sheetData></worksheet>'
  );
}

function toXlsx(table: Table, sheetName: string): Uint8Array<ArrayBuffer> {
  const name = xmlEscape(
    sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1'
  );
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/styles.xml',
      // Style 0 = default, style 1 = bold (used for the header row).
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ],
    ['xl/worksheets/sheet1.xml', sheetXml(table)],
  ];
  const enc = new TextEncoder();
  return zip(files.map(([path, text]) => [enc.encode(path), enc.encode(text)]));
}

// ---- Zip (stored, no compression) ------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(
  files: [name: Uint8Array, data: Uint8Array][]
): Uint8Array<ArrayBuffer> {
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, 00:00
  const local = files.reduce(
    (n, [name, data]) => n + 30 + name.length + data.length,
    0
  );
  const central = files.reduce((n, [name]) => n + 46 + name.length, 0);
  const out = new Uint8Array(local + central + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => (view.setUint16(p, v, true), (p += 2));
  const u32 = (v: number) => (view.setUint32(p, v, true), (p += 4));
  const bytes = (b: Uint8Array) => (out.set(b, p), (p += b.length));

  const entries = files.map(([name, data]) => {
    const entry = { name, data, crc: crc32(data), offset: p };
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0); // flags
    u16(0); // method: stored
    u16(0); // time
    u16(DOS_DATE);
    u32(entry.crc);
    u32(data.length); // compressed size
    u32(data.length); // uncompressed size
    u16(name.length);
    u16(0); // extra length
    bytes(name);
    bytes(data);
    return entry;
  });

  const centralStart = p;
  for (const { name, data, crc, offset } of entries) {
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(0); // flags
    u16(0); // method
    u16(0); // time
    u16(DOS_DATE);
    u32(crc);
    u32(data.length);
    u32(data.length);
    u16(name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offset);
    bytes(name);
  }
  const centralSize = p - centralStart;

  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length
  return out;
}

/** For tests: the encoders without the download. */
export const __internal = { toTable, toCsv, toXlsx };
