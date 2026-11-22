/* The modal layer: the keyboard shortcuts sheet and the command menu.
   Ported from the prototype's openHelp, openPalette and renderPalette (the
   HTML only); commands.js holds the state (S.modal) and the actions. */
import { esc, paletteHeading } from '../model.js';
import { R, kbd, MOD } from './util.js';

const GROUPS = ['Navigate', 'Decide', 'View', 'Run'];

/* The shortcuts sheet listing cmds (commands.js CMDS) by group; focus goes
   to its Close button. */
export function renderHelp(cmds) {
  const el = R('modal');
  el.innerHTML = '<div class="wb-mscrim" data-act="close-modal"></div><section class="wb-modal is-help" role="dialog" aria-modal="true" aria-labelledby="wb-help-t">' +
    '<div class="wb-help-h"><h2 id="wb-help-t">Keyboard shortcuts</h2><button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="close-modal" data-fk="help-close">Close ' + kbd('Esc') + '</button></div>' +
    '<div class="wb-help-b">' + GROUPS.map((g) => '<div class="wb-help-g"><h3>' + g + '</h3>' + cmds.filter((c) => c.g === g).map((c) => '<div class="wb-help-r"><span>' + esc(c.l) + '</span><span>' + c.k.map((x) => kbd(x)).join('') + '</span></div>').join('') + '</div>').join('') + '</div>' +
    '<div class="wb-modal-foot"><span>Shortcuts are off while you type in a field, and while this sheet, the command menu or Analyst settings is open. While a new run is being set up, only ' + esc('O, ?, Esc and ' + MOD + ' K') + ' work.</span></div></section>';
  el.querySelector('[data-fk="help-close"]').focus();
}

/* The command menu's frame: the search field (focused) and an empty list. */
export function renderPaletteShell() {
  const el = R('modal');
  el.innerHTML = '<div class="wb-mscrim" data-act="close-modal"></div><section class="wb-modal" role="dialog" aria-modal="true" aria-label="Command menu">' +
    '<input class="wb-pal-in" data-fk="pal-q" role="combobox" aria-expanded="true" aria-controls="wb-pal-list" aria-autocomplete="list" placeholder="Jump to a company, switch run, or run an action…" autocomplete="off" spellcheck="false">' +
    '<ul class="wb-pal-list" id="wb-pal-list" role="listbox" data-r="pal-list"></ul>' +
    '<div class="wb-modal-foot"><span>' + kbd('↑') + kbd('↓') + ' move</span><span>' + kbd('↵') + ' run</span><span>' + kbd('Esc') + ' close</span></div></section>';
  el.querySelector('[data-fk="pal-q"]').focus();
}

/* The command menu's list: m.items (model.paletteItems) under a heading per
   group (model.paletteHeading), m.active marked and scrolled into view. */
export function renderPaletteList(m) {
  const list = R('pal-list');
  if (!list) return;
  list.innerHTML = m.items.length
    ? m.items.map((it, i) => {
      const head = paletteHeading(m.items, i);
      return (head ? '<li class="wb-pal-h" role="presentation">' + head + '</li>' : '') +
      '<li class="wb-pal-it" role="option" id="wb-pal-' + i + '" data-act="pal-run" data-i="' + i + '" aria-selected="' + (i === m.active) + '">' +
      '<span class="wb-pal-l">' + esc(it.l) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span>' +
      '<span class="wb-pal-keys">' + it.keys.map((k) => kbd(k)).join('') + '</span></li>';
    }).join('')
    : '<li class="wb-pal-empty">No matches</li>';
  const inp = R('modal').querySelector('[data-fk="pal-q"]');
  if (inp) { if (m.items.length) inp.setAttribute('aria-activedescendant', 'wb-pal-' + m.active); else inp.removeAttribute('aria-activedescendant'); }
  const act = list.querySelector('[aria-selected="true"]');
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
}

export function clearModal() {
  R('modal').innerHTML = '';
}
