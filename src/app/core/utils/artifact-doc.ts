/**
 * Artifact documents are stored as plain text (see constants/artifact-content.ts):
 *
 *   <title>
 *   Request: “<prompt>”
 *
 *   ━━━━━━━━━━
 *   📋 SECTION HEADING  (optional meta)
 *   ━━━━━━━━━━
 *     body lines…
 *
 * This module turns that text into structured sections/blocks for a readable canvas, edits single
 * sections, diffs versions, and converts to Markdown / printable HTML for export.
 */

export type DocBlock =
  | { kind: 'para'; text: string }
  | { kind: 'subheading'; text: string; meta?: string }
  | { kind: 'bullet'; text: string; marker: 'dot' | 'arrow' | 'number'; n?: number }
  | { kind: 'item'; tag: string; text: string; badge?: string; tone?: 'must' | 'should' | 'could' | 'high' | 'med' | 'low' }
  | { kind: 'kv'; key: string; values: string[] }
  | { kind: 'table'; rows: string[][] };

export interface DocSection {
  /** Stable within a version: `s-<index>-<slug>`. */
  id: string;
  icon: string;
  heading: string;
  meta?: string;
  blocks: DocBlock[];
  /** Line range of the editable body (after the heading rules) in the source text. */
  bodyStart: number;
  bodyEnd: number;
  /** Raw body text (for section editing / copying). */
  body: string;
}

export interface ParsedDoc {
  request?: string;
  intro: DocBlock[];
  sections: DocSection[];
  words: number;
}

const RULE = /^\s*[━─=]{6,}\s*$/;
const ACRONYMS = new Set(['SWOT', 'PRD', 'TAM', 'SAM', 'SOM', 'API', 'AI', 'OKR', 'OKRS', 'KPI', 'KPIS', 'MVP', 'NFR', 'UX', 'UI', 'Q1', 'Q2', 'Q3', 'Q4', 'ADO', 'US']);
const RULE_LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/** "EXECUTIVE SUMMARY" → "Executive summary" (acronyms kept). Mixed-case headings are left alone. */
export function sentenceCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const words = text.toLowerCase().split(/(\s+)/);
  let first = true;
  return words.map(w => {
    if (!w.trim()) return w;
    if (ACRONYMS.has(w.toUpperCase().replace(/[^A-Z0-9]/g, ''))) return w.toUpperCase();
    if (first) { first = false; return w.charAt(0).toUpperCase() + w.slice(1); }
    return w;
  }).join('');
}

function splitHeading(line: string): { icon: string; heading: string; meta?: string } {
  let text = line.trim();
  let icon = '';
  const m = text.match(/^([^\p{L}\p{N}\s]+)\s+(.*)$/u);
  if (m) { icon = m[1]; text = m[2]; }
  let meta: string | undefined;
  const metaMatch = text.match(/^(.*?)\s{2,}\((.*)\)\s*$/) || text.match(/^(.*?)\s+\((.*)\)\s*$/);
  if (metaMatch) { text = metaMatch[1]; meta = metaMatch[2]; }
  const scored = text.match(/^(.*?):\s*(.+)$/);
  if (!meta && scored && /\d/.test(scored[2])) { text = scored[1]; meta = scored[2]; }
  return { icon, heading: sentenceCase(text.trim()), meta };
}

const TAG = /^((?:[A-Z]{1,6}-\d+(?:\.\d+)?)|(?:Story \d+(?:\.\d+)?)|(?:KR\d+)|(?:Concept [A-Z]))\s{1,}(.+)$/;
const PRIORITY = /^\[(MUST|SHOULD|COULD|WONT)\]\s*(.*)$/i;
const RISK = /^(🔴|🟡|🟢)\s+(HIGH|MED|MEDIUM|LOW)\s+(.*)$/;
const POINTS = /^(.*?)\s{2,}(\d+\s*pts?)$/;

/** Classify a section body into display blocks. */
export function parseBlocks(lines: string[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  let table: string[][] | null = null;
  const flushTable = () => {
    if (table && table.length) {
      const width = Math.max(...table.map(r => r.length));
      blocks.push({ kind: 'table', rows: table.map(r => (r.length < width ? [...Array(width - r.length).fill(''), ...r] : r)) });
    }
    table = null;
  };

  lines.forEach((raw, i) => {
    const t = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    if (!t) { flushTable(); return; }

    // Continuation of a "Key → value" group: deeply indented arrow line.
    const last = blocks[blocks.length - 1];
    if (/^→\s+/.test(t) && indent >= 6 && last?.kind === 'kv' && !table) {
      last.values.push(t.replace(/^→\s+/, ''));
      return;
    }

    // Unindented short line followed by indented content → sub-heading ("Q3 2025 — Foundation", "EPIC-01 · …  [13 pts]").
    const nextLine = lines.slice(i + 1).find(l => l.trim());
    if (indent === 0 && t.length < 90 && !/[.!?]$/.test(t) && nextLine && /^\s+/.test(nextLine)) {
      flushTable();
      const meta = t.match(/^(.*?)\s*\[(.+)\]\s*$/);
      blocks.push({ kind: 'subheading', text: meta ? meta[1] : t, meta: meta?.[2] });
      return;
    }

    const risk = t.match(RISK);
    if (risk) {
      flushTable();
      const tone = risk[2].startsWith('H') ? 'high' : risk[2].startsWith('M') ? 'med' : 'low';
      blocks.push({ kind: 'item', tag: risk[2] === 'MEDIUM' ? 'MED' : risk[2], text: risk[3], tone });
      return;
    }

    const tag = t.match(TAG);
    if (tag) {
      flushTable();
      let text = tag[2].trim();
      let badge: string | undefined;
      let tone: 'must' | 'should' | 'could' | undefined;
      const pr = text.match(PRIORITY);
      if (pr) { badge = pr[1].toUpperCase(); tone = (pr[1].toLowerCase() as 'must' | 'should' | 'could'); text = pr[2]; }
      const pts = text.match(POINTS);
      if (pts) { text = pts[1].trim(); badge = pts[2]; }
      blocks.push({ kind: 'item', tag: tag[1], text, badge, tone });
      return;
    }

    const bullet = t.match(/^(▸|→|•|-|\*)\s+(.*)$/);
    if (bullet) {
      flushTable();
      blocks.push({ kind: 'bullet', text: bullet[2], marker: bullet[1] === '→' ? 'arrow' : 'dot' });
      return;
    }
    const numbered = t.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      flushTable();
      blocks.push({ kind: 'bullet', text: numbered[2], marker: 'number', n: Number(numbered[1]) });
      return;
    }

    const kv = t.match(/^([^→]{1,30}?)\s*→\s*(.+)$/);
    if (kv) {
      flushTable();
      blocks.push({ kind: 'kv', key: kv[1].trim(), values: [kv[2].trim()] });
      return;
    }

    // Column layouts (≥ 3 cells separated by 2+ spaces) become a table.
    const cells = t.split(/\s{2,}/);
    if (cells.length >= 3) {
      (table ??= []).push(cells);
      return;
    }
    flushTable();

    blocks.push({ kind: 'para', text: t });
  });
  flushTable();
  return blocks;
}

export function parseDoc(content: string, title?: string): ParsedDoc {
  const lines = content.split('\n');
  const sections: DocSection[] = [];
  const introLines: string[] = [];
  let request: string | undefined;

  let i = 0;
  // Intro: everything before the first rule. A line right before "Request: …" is the generated title
  // (it may differ from the current title after a rename), so it's not repeated in the body.
  while (i < lines.length && !RULE.test(lines[i])) {
    const t = lines[i].trim();
    const req = t.match(/^Request:\s*[“"](.*)[”"]\s*$/);
    const nextIsRequest = /^Request:/.test(lines[i + 1]?.trim() ?? '');
    if (req) request = req[1];
    else if (t && t !== title?.trim() && !(i === 0 && nextIsRequest)) introLines.push(lines[i]);
    i++;
  }

  while (i < lines.length) {
    // Expect: rule, heading, rule.
    if (RULE.test(lines[i]) && i + 1 < lines.length && !RULE.test(lines[i + 1])) {
      const headingLine = lines[i + 1];
      let bodyStart = i + 2;
      if (bodyStart < lines.length && RULE.test(lines[bodyStart])) bodyStart++;
      let bodyEnd = bodyStart;
      while (bodyEnd < lines.length && !RULE.test(lines[bodyEnd])) bodyEnd++;
      const bodyLines = lines.slice(bodyStart, bodyEnd);
      const { icon, heading, meta } = splitHeading(headingLine);
      const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32);
      sections.push({
        id: `s-${sections.length}-${slug}`, icon, heading, meta,
        blocks: parseBlocks(bodyLines), bodyStart, bodyEnd,
        body: trimBlankEdges(bodyLines).join('\n')
      });
      i = bodyEnd;
    } else {
      i++;
    }
  }

  const words = content.replace(/[━─=]{3,}/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return { request, intro: parseBlocks(introLines), sections, words };
}

function trimBlankEdges(lines: string[]): string[] {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

/** Replace one section's body (keeps a blank line before the next section for readability). */
export function replaceSectionBody(content: string, section: DocSection, body: string): string {
  const lines = content.split('\n');
  const next = section.bodyEnd < lines.length ? [''] : [];
  return [...lines.slice(0, section.bodyStart), ...body.replace(/\s+$/, '').split('\n'), ...next, ...lines.slice(section.bodyEnd)].join('\n');
}

// ── Diff ────────────────────────────────────────────────────────────────

export interface DiffLine { type: 'same' | 'add' | 'del'; text: string; }
export type DiffChunk = { type: 'lines'; lines: DiffLine[] } | { type: 'fold'; lines: DiffLine[] };

/** Line diff (LCS). Rule lines are ignored so the diff focuses on words, not decoration. */
export function diffLines(before: string, after: string): { lines: DiffLine[]; added: number; removed: number } {
  const clean = (s: string) => s.split('\n').filter(l => !RULE.test(l));
  const a = clean(before), b = clean(after);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0, added = 0, removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i++] }); removed++; }
    else { out.push({ type: 'add', text: b[j++] }); added++; }
  }
  while (i < n) { out.push({ type: 'del', text: a[i++] }); removed++; }
  while (j < m) { out.push({ type: 'add', text: b[j++] }); added++; }
  return { lines: out, added, removed };
}

/** Folds long unchanged stretches, keeping `context` lines around each change. */
export function foldDiff(lines: DiffLine[], context = 3): DiffChunk[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.type !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const chunks: DiffChunk[] = [];
  lines.forEach((l, i) => {
    const type = keep[i] ? 'lines' : 'fold';
    const last = chunks[chunks.length - 1];
    if (last && last.type === type) last.lines.push(l);
    else chunks.push({ type, lines: [l] });
  });
  // Tiny folds aren't worth a button.
  return chunks.map(c => (c.type === 'fold' && c.lines.length <= 2 ? { type: 'lines' as const, lines: c.lines } : c));
}

// ── Export ──────────────────────────────────────────────────────────────

function blockToMarkdown(b: DocBlock): string {
  switch (b.kind) {
    case 'para': return b.text;
    case 'subheading': return `### ${b.text}${b.meta ? ` (${b.meta})` : ''}`;
    case 'bullet': return b.marker === 'number' ? `${b.n}. ${b.text}` : `- ${b.text}`;
    case 'item': return `- **${b.tag}**${b.badge ? ` \`${b.badge}\`` : ''} ${b.text}`;
    case 'kv': return b.values.length === 1 ? `- **${b.key}:** ${b.values[0]}` : `- **${b.key}:**\n${b.values.map(v => `  - ${v}`).join('\n')}`;
    case 'table': {
      const [head, ...rest] = b.rows;
      const row = (r: string[]) => `| ${r.join(' | ')} |`;
      return [row(head), row(head.map(() => '---')), ...rest.map(row)].join('\n');
    }
  }
}

/** Joins blocks; consecutive list-like blocks stay together, everything else is a paragraph. */
function blocksToMarkdown(blocks: DocBlock[]): string {
  const list = (b: DocBlock) => b.kind === 'bullet' || b.kind === 'item' || b.kind === 'kv';
  return blocks.map((b, i) => (i > 0 && !(list(b) && list(blocks[i - 1])) ? '\n' : '') + blockToMarkdown(b)).join('\n');
}

export function toMarkdown(title: string, content: string): string {
  const doc = parseDoc(content, title);
  const parts = [`# ${title}`];
  if (doc.request) parts.push(`> **Request:** ${doc.request}`);
  if (doc.intro.length) parts.push(blocksToMarkdown(doc.intro));
  for (const s of doc.sections) {
    parts.push(`## ${s.icon ? s.icon + ' ' : ''}${s.heading}${s.meta ? ` — ${s.meta}` : ''}`);
    if (s.blocks.length) parts.push(blocksToMarkdown(s.blocks));
  }
  return parts.join('\n\n') + '\n';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function blocksToHtml(blocks: DocBlock[]): string {
  const out: string[] = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
  for (const b of blocks) {
    if (b.kind === 'bullet' || b.kind === 'item' || b.kind === 'kv') {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      if (b.kind === 'bullet') out.push(`<li>${esc(b.text)}</li>`);
      else if (b.kind === 'item') out.push(`<li><b>${esc(b.tag)}</b>${b.badge ? ` <code>${esc(b.badge)}</code>` : ''} ${esc(b.text)}</li>`);
      else out.push(`<li><b>${esc(b.key)}:</b> ${b.values.map(esc).join('<br>')}</li>`);
      continue;
    }
    closeList();
    if (b.kind === 'para') out.push(`<p>${esc(b.text)}</p>`);
    if (b.kind === 'subheading') out.push(`<h3>${esc(b.text)}${b.meta ? ` <small>${esc(b.meta)}</small>` : ''}</h3>`);
    if (b.kind === 'table') {
      const [head, ...rest] = b.rows;
      out.push(`<table><thead><tr>${head.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    }
  }
  closeList();
  return out.join('\n');
}

/** Standalone, print-friendly HTML (used for PDF via print and for the Word .doc export). */
export function toHtml(title: string, content: string, meta: string): string {
  const doc = parseDoc(content, title);
  const sections = doc.sections.map(s => `<h2>${s.icon ? esc(s.icon) + ' ' : ''}${esc(s.heading)}${s.meta ? ` <small>${esc(s.meta)}</small>` : ''}</h2>\n${blocksToHtml(s.blocks)}`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Mulish, Arial, sans-serif; color: #1f1d3a; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.55; font-size: 13px; }
  h1 { font-size: 24px; margin: 0 0 4px; } .meta { color: #6b6890; margin: 0 0 18px; }
  .req { border-left: 3px solid #7c3aed; background: #f6f3ff; padding: 8px 12px; margin: 0 0 18px; }
  h2 { font-size: 16px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e6e3f5; } h3 { font-size: 13.5px; margin: 14px 0 6px; }
  small { color: #6b6890; font-weight: normal; } code { background: #f1effa; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
  ul { padding-left: 18px; margin: 6px 0; } li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; } th, td { border: 1px solid #e6e3f5; padding: 5px 8px; text-align: left; } th { background: #f6f3ff; }
  @media print { body { margin: 0 auto; } h2 { break-after: avoid; } }
</style></head><body>
<h1>${esc(title)}</h1><p class="meta">${esc(meta)}</p>
${doc.request ? `<div class="req"><b>Request:</b> ${esc(doc.request)}</div>` : ''}
${blocksToHtml(doc.intro)}
${sections}
</body></html>`;
}

/** Builds a new section in stored-text form (used when appending a section). */
export function sectionText(heading: string, body: string): string {
  return `${RULE_LINE}\n${heading.toUpperCase()}\n${RULE_LINE}\n${body}`;
}
