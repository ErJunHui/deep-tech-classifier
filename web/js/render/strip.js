/* The summary strip: counts over the whole run and the confidence
   histogram. Ported from the prototype's renderStrip, plus the errors
   sub-line under Processed. */
import { counts, rowView, countOf } from '../model.js';
import { S, setupShown } from '../store.js';
import { R } from './util.js';
import { counterHtml, putWithCounters } from './counter.js';

/* opts.animate: the counters roll to their new values (polling, decisions). */
export function renderStrip(opts) {
  if (setupShown()) return; // hidden while a new run is set up
  const el = R('strip');
  el.hidden = !S.active;
  if (!S.active) { el.innerHTML = ''; return; }
  const run = S.active.run; const rows = S.active.rows;
  const k = counts(rows);
  const f = S.f;
  const L = (long, short) => '<span class="wb-l-long">' + long + '</span><span class="wb-l-short">' + short + '</span>';
  /* subCls: an extra class for the sub-line. */
  const stat = (key, label, value, cls, pressed, sub, extra, subCls) => {
    const inner = '<span class="wb-stat-l">' + label + '</span><span class="wb-stat-v ' + (cls || '') + '">' + value + '</span>' + (sub ? '<span class="wb-stat-s' + (subCls ? ' ' + subCls : '') + '">' + sub + '</span>' : '');
    return key ? '<button class="wb-stat" data-act="stat" data-k="' + key + '" data-fk="stat-' + key + '" aria-pressed="' + !!pressed + '">' + inner + '</button>' : '<div class="wb-stat' + (extra ? ' is-extra' : '') + '">' + inner + '</div>';
  };
  const sub = [];
  if (k.confirmed) sub.push(k.confirmed + ' reviewed');
  if (k.reclassified) sub.push(k.reclassified + ' reclassified');
  const errSub = k.errors ? k.errors + (k.errors === 1 ? ' error' : ' errors') + ' · retried on resume' : '';
  let html = stat(null, L('Processed', 'Done'), counterHtml('done', k.done) + '<small>/' + k.total + '</small>', '', false, errSub, false, 'is-wrap') +
    '<span class="wb-strip-sep"></span>' +
    stat('deep', L('Deep tech', 'Deep'), counterHtml('deep', k.deep), 'is-deep', f.verdict.size === 1 && f.verdict.has('deep tech')) +
    stat('general', L('General tech', 'General'), counterHtml('general', k.general), '', f.verdict.size === 1 && f.verdict.has('general tech')) +
    stat('review', L('Needs review', 'Review'), counterHtml('review', k.open), k.open ? 'is-review' : '', f.status.size === 1 && f.status.has('open'), sub.join(' · ')) +
    '<span class="wb-strip-sep"></span>' +
    stat(null, 'Avg conf.', k.avg == null ? '—' : k.avg, '', false, '', true) +
    stat(null, run.status === 'running' ? 'Cost so far' : 'Cost', k.costUnknown ? 'unknown' : counterHtml('cost', k.cost, 'usd'), '', false, '', true);
  const bins = Array.from({ length: 10 }, () => ({ d: 0, g: 0 }));
  rows.forEach((row) => {
    const v = rowView(row); if (!v.r || v.error) return;
    const b = bins[Math.min(9, Math.floor(v.r.conf / 10))];
    if (v.verdict === 'deep tech') b.d++; else b.g++;
  });
  const max = Math.max(1, ...bins.map((b) => b.d + b.g));
  const th = Number((run.settings || {}).validatorThreshold) || 0;
  html += '<div class="wb-hist"><div class="wb-hist-bars" role="group" aria-label="Confidence distribution by final verdict">' + bins.map((b, i) => {
    const n = b.d + b.g;
    const lo = i * 10; const hi = i === 9 ? 100 : i * 10 + 9;
    return '<button class="wb-bin" data-act="bin" data-bin="' + i + '" data-fk="bin-' + i + '" aria-pressed="' + (f.bin === i) + '" ' + (n ? '' : 'disabled') + ' title="Confidence ' + lo + '–' + hi + ': ' + b.d + ' deep tech, ' + b.g + ' general tech" aria-label="Confidence ' + lo + ' to ' + hi + ', ' + countOf(n, 'company', 'companies') + '">' +
      '<span class="wb-bin-g" style="height:' + Math.round(b.g / max * 30) + 'px"></span><span class="wb-bin-d" style="height:' + Math.round(b.d / max * 30) + 'px"></span></button>';
  }).join('') + '<span class="wb-hist-th" style="left:' + th + '%" title="Validation threshold ' + th + '"></span></div>' +
    '<div class="wb-hist-ax"><span>0</span><span><i class="wb-sw" style="background:var(--deep)"></i>deep · <i class="wb-sw" style="background:var(--border-strong)"></i>general</span><span>100</span></div></div>';
  putWithCounters(el, html, opts);
}
