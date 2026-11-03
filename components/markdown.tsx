import 'katex/dist/katex.min.css';
import katex from 'katex';
import { Fragment, type ReactNode } from 'react';

/**
 * Minimal Markdown renderer. Builds React nodes (never raw HTML), so authored text cannot inject markup.
 * Supports: paragraphs, `#`–`####` headings, `-`/`*` and `1.` lists, fenced code, and inline
 * **bold**, *italic*, `code`, [links](https://…) and LaTeX (KaTeX): `$x^2$` inline, `$$…$$` as a display
 * block (also across lines). In `$…$` the opening `$` must be followed, and the closing one preceded, by a
 * non-space, and the closing one must not be followed by a digit, so prices like "$5 and $10" stay text.
 * Anything else is shown as plain text.
 */
export function Markdown({
  source,
  inline = false,
  className,
}: {
  source: string;
  /** Render only inline formatting, with no block wrapper (for titles). */
  inline?: boolean;
  className?: string;
}) {
  if (inline)
    return <span className={className}>{renderInline(source, 'i')}</span>;
  return <div className={className}>{renderBlocks(source)}</div>;
}

const INLINE =
  /`([^`]+)`|\$\$(.+?)\$\$|\$(?!\s)([^$\n]*?[^\s$])\$(?!\d)|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/;

function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] != null)
      out.push(
        <code key={k} className="bg-slate-200 px-1 font-mono text-sm">
          {m[1]}
        </code>
      );
    else if (m[2] != null || m[3] != null)
      out.push(<Tex key={k} tex={(m[2] ?? m[3])!} display={m[2] != null} />);
    else if (m[4] != null)
      out.push(<strong key={k}>{renderInline(m[4], k)}</strong>);
    else if (m[5] != null) out.push(<em key={k}>{renderInline(m[5], k)}</em>);
    else if (SAFE_HREF.test(m[7]))
      out.push(
        <a
          key={k}
          href={m[7]}
          className="text-primary-700 underline"
          {...(m[7].startsWith('http')
            ? { target: '_blank', rel: 'noreferrer' }
            : {})}
        >
          {renderInline(m[6], k)}
        </a>
      );
    else out.push(m[6]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** KaTeX output is generated markup (no authored HTML passes through), so injecting it is safe; bad TeX shows as red source. */
function Tex({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: 'htmlAndMathml',
  });
  return (
    <span
      className={display ? 'block overflow-x-auto' : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```/;
const DISPLAY = /^\s*\$\$/;
const DISPLAY_END = /\$\$\s*$/;

const isBlockStart = (line: string) =>
  line.trim() === '' ||
  HEADING.test(line) ||
  BULLET.test(line) ||
  NUMBERED.test(line) ||
  FENCE.test(line) ||
  DISPLAY.test(line);

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${out.length}`;
    if (line.trim() === '') {
      i++;
    } else if (FENCE.test(line)) {
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++)
        code.push(lines[i]);
      i++; // closing fence
      out.push(
        <pre
          key={key}
          className="mb-2 overflow-x-auto bg-slate-200 p-2 font-mono text-sm"
        >
          {code.join('\n')}
        </pre>
      );
    } else if (DISPLAY.test(line)) {
      // `$$ … $$` on one line, or opened on one line and closed on a later one.
      const tex = [line.replace(DISPLAY, '')];
      let closed = DISPLAY_END.test(tex[0]);
      for (i++; !closed && i < lines.length; i++) {
        tex.push(lines[i]);
        closed = DISPLAY_END.test(lines[i]);
      }
      out.push(
        <p key={key} className="mb-2">
          <Tex tex={tex.join('\n').replace(DISPLAY_END, '')} display />
        </p>
      );
    } else if (HEADING.test(line)) {
      const [, hashes, text] = line.match(HEADING)!;
      out.push(
        <p
          key={key}
          className={`mb-2 font-semibold ${hashes.length <= 2 ? 'text-lg' : ''}`}
        >
          {renderInline(text, key)}
        </p>
      );
      i++;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const re = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i]); i++)
        items.push(lines[i].match(re)![1]);
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List
          key={key}
          className={`mb-2 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
          ))}
        </List>
      );
    } else {
      const para: string[] = [];
      for (
        ;
        i < lines.length && (para.length === 0 || !isBlockStart(lines[i]));
        i++
      )
        para.push(lines[i].trim());
      out.push(
        <p key={key} className="mb-2">
          <Fragment>{renderInline(para.join(' '), key)}</Fragment>
        </p>
      );
    }
  }
  return out;
}
