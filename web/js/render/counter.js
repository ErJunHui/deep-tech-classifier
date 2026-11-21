/* Animated counters: the run header's "12 of 20" and the strip's Processed,
   Deep tech, General tech, Needs review and Cost values. They use NumberFlow's
   <number-flow> element (web/vendor/number-flow, 0.6.2) when main.js managed
   to load it, else a plain <span> with the formatted text.

   NumberFlow 0.6.2 API used (dist/index.d.ts, dist/lite.d.ts): the
   properties `locales` and `format` (Intl.NumberFormat arguments, read on the
   next update), `update(value)` to show a value (animated unless `animated`
   is false; the first update never animates) and `animated` (default true).
   Its default `respectMotionPreference: true` is kept, so a reduced-motion
   setting turns the roll off. */
import { put } from './util.js';

/* Whole numbers with thousands separators; cost in US dollars with 2
   decimals (US$4.31). */
const FORMATS = {
  int: { locales: 'en-US', format: { maximumFractionDigits: 0 } },
  usd: { locales: 'en-GB', format: { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 } },
};
const formatters = {};
export function fmtCounter(value, format) {
  const f = FORMATS[format] || FORMATS.int;
  if (!formatters[format]) formatters[format] = new Intl.NumberFormat(f.locales, f.format);
  return formatters[format].format(value);
}

const flowDefined = () => typeof customElements !== 'undefined' && !!customElements.get('number-flow');

/* A counter placeholder for HTML; putWithCounters (or setCounter) gives it
   its value. format: 'int' or 'usd'. */
export function counterHtml(key, value, format) {
  const fmt = format || 'int';
  const attrs = ' class="wb-counter" data-counter="' + key + '" data-format="' + fmt + '" data-value="' + Number(value) + '"';
  return flowDefined()
    ? '<number-flow' + attrs + '></number-flow>'
    : '<span' + attrs + '>' + fmtCounter(value, fmt) + '</span>';
}

/* Shows value in a counter element: rolled from the old value when animate,
   else set without a transition. */
export function setCounter(el, value, opts) {
  const fmt = el.getAttribute('data-format') || 'int';
  if (el.localName === 'number-flow' && typeof el.update === 'function') {
    const f = FORMATS[fmt] || FORMATS.int;
    el.locales = f.locales;
    el.format = f.format;
    if (opts && opts.animate) el.update(value);
    else { el.animated = false; el.update(value); el.animated = true; }
  } else {
    el.textContent = fmtCounter(value, fmt);
  }
  el.setAttribute('data-value', String(value));
}

/* put() for a region that holds counters. A counter already on screen under
   the same key is kept (moved into the new HTML in place of its placeholder)
   so it can roll from its old value; animate says whether it should. Every
   counter then gets the value its placeholder carries. */
export function putWithCounters(el, html, opts) {
  if (!el) return;
  const animate = !!(opts && opts.animate);
  const old = new Map();
  el.querySelectorAll('[data-counter]').forEach((c) => old.set(c.getAttribute('data-counter'), c));
  put(el, html);
  el.querySelectorAll('[data-counter]').forEach((c) => {
    const value = Number(c.getAttribute('data-value'));
    const prev = old.get(c.getAttribute('data-counter'));
    if (prev && prev.localName === c.localName && prev.getAttribute('data-format') === c.getAttribute('data-format')) {
      const same = Number(prev.getAttribute('data-value')) === value;
      c.replaceWith(prev);
      if (!same) setCounter(prev, value, { animate });
    } else {
      setCounter(c, value, { animate: false });
    }
  });
}
