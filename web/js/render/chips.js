/* The toolbar: search placeholder, Filters toggle and the filter chips.
   Ported from the prototype's renderChips. Counts are over the whole run. */
import { esc, counts, anyFilter } from '../model.js';
import { S } from '../store.js';
import { R, put } from './util.js';

const RISKS = ['Escalate', 'Contested', 'Uncertain', 'Clear'];

export function renderChips() {
  if (S.draft) return; // hidden while a new run is set up
  const tools = R('tools');
  tools.hidden = !S.active;
  if (!S.active) { R('chips').innerHTML = ''; return; }
  const run = S.active.run; const total = S.active.rows.length;
  const k = counts(S.active.rows);
  const f = S.f;
  const search = tools.querySelector('[data-fk="search"]');
  if (search) search.placeholder = 'Search all ' + total.toLocaleString('en-US') + ' companies';
  const nAct = f.risk.size + f.verdict.size + f.status.size + (f.bin != null ? 1 : 0);
  tools.classList.toggle('is-open', S.filtersOpen);
  const tg = R('filt-tg');
  tg.setAttribute('aria-expanded', String(S.filtersOpen));
  tg.textContent = 'Filters' + (nAct ? ' · ' + nAct + ' active' : '') + (anyFilter(f) ? ' · ' + S.viewIds.length + ' of ' + total : '') + (S.filtersOpen ? ' ▴' : ' ▾');
  const chip = (grp, val, label, n) => '<button class="wb-chip" data-act="chip" data-g="' + grp + '" data-v="' + esc(val) + '" data-fk="chip-' + grp + '-' + esc(val) + '" aria-pressed="' + f[grp].has(val) + '">' + label + ' <span class="wb-chip-n">' + n + '</span></button>';
  let html = '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Review</span>' + chip('status', 'open', 'Needs review', k.open) + chip('status', 'reviewed', 'Reviewed', k.confirmed) + chip('status', 'reclassified', 'Reclassified', k.reclassified) + '</span>' +
    '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Risk</span>' + RISKS.map((r) => chip('risk', r, r, k.risk[r])).join('') + '</span>' +
    '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Verdict</span>' + chip('verdict', 'deep tech', 'Deep tech', k.deep) + chip('verdict', 'general tech', 'General tech', k.general) + '</span>';
  if (f.bin != null) html += '<button class="wb-chip" data-act="clear-bin" data-fk="chip-bin" aria-pressed="true">Confidence ' + (f.bin * 10) + '–' + (f.bin === 9 ? 100 : f.bin * 10 + 9) + ' ✕</button>';
  let right = '<span class="wb-num">' + (anyFilter(f) ? 'Showing ' + S.viewIds.length + ' of ' + total : total + ' rows') + '</span>';
  if (anyFilter(f)) right += '<button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="clear-filters" data-fk="clear-filters">Clear filters</button>';
  if (S.sortKey !== 'priority') right += '<button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="sort-priority" data-fk="sort-priority" title="Needs review first, then lowest confidence">Sort: review priority</button>';
  else right += '<span class="wb-muted">' + (run.status === 'running' ? 'Input order while running' : 'Review priority order') + '</span>';
  put(R('chips'), html + '<span class="wb-tools-r">' + right + '</span>');
}
