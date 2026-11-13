/* Variant: Guided. A linear, one-decision-per-screen wizard for the occasional,
   non-technical user: File -> Columns -> Settings -> Run -> Results. */
(function () {
  'use strict';
  window.PROTO_VARIANTS = window.PROTO_VARIANTS || {};
  const D = window.PROTO_DATA;

  /* ------------------------------------------------------------------ */
  /* Static copy                                                          */
  /* ------------------------------------------------------------------ */

  const STEPS = [
    { key: 'file', label: 'File' },
    { key: 'columns', label: 'Columns' },
    { key: 'settings', label: 'Settings' },
    { key: 'run', label: 'Run' },
    { key: 'results', label: 'Results' },
  ];

  const FIELDS = [
    { key: 'company_name', label: 'Company name', help: 'Required. Rows without a name are skipped.', required: true },
    { key: 'description', label: 'What the company does', help: 'Optional. Used when the web lookup finds nothing better.' },
    { key: 'domain', label: 'Industry or sector', help: 'Optional. Gives the classifier a little context.' },
    { key: 'uen', label: 'UEN', help: 'Optional. Helps tell apart companies with similar names.' },
  ];

  const TIERS = [
    { key: 'fast', label: 'Fast', line: 'Cheapest and quickest. Right for a first screen of a long list.' },
    { key: 'balanced', label: 'Balanced', line: 'Reads borderline companies more carefully. About twice the cost.' },
    { key: 'best', label: 'Best', line: 'The most careful reading, for final decisions. Nearly four times the cost.' },
  ];

  const CRITERIA = [
    { key: 'innovation', label: 'Original innovation', ask: 'Does it create new technology, rather than apply existing tools?' },
    { key: 'scientific_foundation', label: 'Grounded in hard science', ask: 'Does the product rest on science or deep engineering?' },
    { key: 'proprietary_ip', label: 'Hard to copy', ask: 'Do patents, trade secrets or know-how protect it?' },
  ];

  const STEP_TEXT = {
    enrich: (c) => `Looking ${c.name} up on the web`,
    patents: () => 'Checking the European Patent Office for patents',
    classify: () => 'Testing it against the three deep tech criteria',
    score: () => 'Working out how confident the verdict is',
    validate: () => 'Confidence was low, so taking a second look on the web',
  };
  const STEP_SHORT = [
    ['enrich', 'Web lookup'], ['patents', 'Patents'], ['classify', 'Criteria'], ['score', 'Confidence'], ['validate', 'Second look'],
  ];

  const RISK_ORDER = { Escalate: 0, Contested: 1, Uncertain: 2, Clear: 3 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = (n) => '$' + n.toFixed(2);
  const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  const provider = (id) => D.providers.find((p) => p.id === id);
  const verdictLabel = (v) => (v === 'deep tech' ? 'Deep tech' : 'General tech');
  const otherVerdict = (v) => (v === 'deep tech' ? 'general tech' : 'deep tech');
  const tierFactor = (tier) => D.estCostPerCompany[tier] / D.estCostPerCompany.fast;

  function confWord(n) {
    if (n >= 90) return 'Near-definitive';
    if (n >= 75) return 'Strong';
    if (n >= 60) return 'Moderate';
    if (n >= 45) return 'Borderline';
    if (n >= 30) return 'Weak';
    return 'Minimal';
  }

  function dateParts(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return {
      label: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      stamp: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`,
    };
  }

  function outputName(fileName, d) {
    return fileName.replace(/\.(xlsx|xls|csv)$/i, '') + '_classified_' + dateParts(d).stamp + '.xlsx';
  }

  function duration(sec) {
    if (sec < 90) return 'about a minute';
    if (sec < 3600) return `about ${Math.round(sec / 60)} minutes`;
    return `about ${(sec / 3600).toFixed(1)} hours`;
  }

  /* Rough cost model. Shares of a default run's cost: web lookup ~35%,
     classification ~35% (half with batch), second look ~30% scaled by how
     often it triggers. Normalised so the defaults equal estCostPerCompany. */
  function estimate(settings, rows) {
    const prov = provider(settings.provider);
    const batch = settings.batch && prov.batch;
    const parts = (s, b) => (s.enrichment ? 0.35 : 0) + 0.35 * (b ? 0.5 : 1) + (s.validator ? 0.3 * (s.validatorThreshold / 70) : 0);
    const base = parts(D.defaults, true);
    const cost = rows * D.estCostPerCompany[settings.tier] * parts(settings, batch) / base;
    let factor = 1 - (settings.enrichment ? 0 : 0.3) - (settings.epo ? 0 : 0.1) - (settings.validator ? 0 : 0.15);
    const secs = rows * (batch ? D.estSecondsPerCompany.batch : D.estSecondsPerCompany.sequential) * factor;
    return { cost, low: cost * 0.75, high: cost * 1.3, secs, batch };
  }

  function mappingErrors(mapping) {
    const errs = [];
    if (!mapping.company_name) errs.push('Choose the column that holds company names. It is the only one we cannot do without.');
    const used = {};
    FIELDS.forEach((f) => {
      const col = mapping[f.key];
      if (!col) return;
      if (used[col]) errs.push(`"${col}" is used for both ${used[col]} and ${f.label.toLowerCase()}. Each column should be used once.`);
      used[col] = f.label.toLowerCase();
    });
    return errs;
  }

  function sampleValues(col) {
    if (!col) return '';
    const vals = D.file.preview.map((r) => r[col]).filter(Boolean);
    if (!vals.length) return '<span class="g-muted">No preview for this column</span>';
    return 'e.g. ' + vals.slice(0, 2).map((v) => `<span class="g-sample">${esc(v)}</span>`).join(', ');
  }

  /* ---- run bookkeeping ---- */

  function activeSteps(c, s) {
    const steps = [];
    if (s.enrichment) steps.push('enrich');
    if (s.epo) steps.push('patents');
    steps.push('classify', 'score');
    if (s.validator && c.validator.triggered) steps.push('validate');
    return steps;
  }

  const finalVerdict = (run, c) => (run.decisions[c.id] ? run.decisions[c.id].verdict : c.verdict);

  function flagged(run) {
    return run.results
      .filter((c) => c.risk !== 'Clear')
      .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.confidence - b.confidence);
  }

  function tally(run) {
    const t = { deep: run.prior.deep, general: run.prior.general, clear: run.prior.deep + run.prior.general, pending: 0, decided: 0, flagged: 0 };
    run.results.forEach((c) => {
      if (finalVerdict(run, c) === 'deep tech') t.deep++; else t.general++;
      if (c.risk === 'Clear') t.clear++;
      else { t.flagged++; if (run.decisions[c.id]) t.decided++; else t.pending++; }
    });
    t.done = run.offset + run.results.length;
    t.cost = run.results.reduce((a, c) => a + c.cost, 0) * tierFactor(run.settings.tier);
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* Icons                                                                */
  /* ------------------------------------------------------------------ */

  const ICON = {
    check: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 2.75h8l4.25 4.25V21.25H6z M14 2.75V7h4.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h6M9 15.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 15V4m0 0l-4 4m4-4l4 4M5 15v4.25h14V15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrowR: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10m-4-4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrowL: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13 8H3m4-4L3 8l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    download: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5v8m0 0L5 7.5m3 3l3-3M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */

  function freshState() {
    return {
      screen: 'file',
      file: null,
      fileNote: '',
      mapping: null,
      settings: Object.assign({}, D.defaults),
      advancedOpen: false,
      keyHelp: false,
      run: null,
      view: 'summary',
      reviewIdx: 0,
      reviewMsg: '',
      detailId: null,
      detailBack: 'list',
      runs: [],
      past: D.pastRuns.map((r) => Object.assign({}, r)),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Markup builders (pure: state in, HTML out)                           */
  /* ------------------------------------------------------------------ */

  function stepReachable(S, key) {
    const busy = S.screen === 'run' || S.screen === 'results';
    if (busy) {
      if (key === 'run') return !!S.run;
      if (key === 'results') return !!S.run && S.run.status !== 'running' && S.run.results.length > 0;
      return false;
    }
    if (key === 'file') return true;
    if (key === 'columns') return !!S.file;
    if (key === 'settings') return !!S.file && mappingErrors(S.mapping).length === 0;
    return false;
  }

  function stepperHTML(S) {
    const cur = STEPS.findIndex((s) => s.key === S.screen);
    return `<ol class="g-steps">${STEPS.map((s, i) => {
      const state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
      const reach = i !== cur && stepReachable(S, s.key);
      const mark = state === 'done' ? ICON.check : String(i + 1);
      const inner = `<span class="g-step-dot">${mark}</span><span class="g-step-label">${s.label}</span>`;
      const body = reach
        ? `<button type="button" class="g-step-btn" data-action="step" data-step="${s.key}">${inner}</button>`
        : `<span class="g-step-btn" ${i === cur ? 'aria-current="step"' : ''}>${inner}</span>`;
      return `<li class="g-step is-${state}">${body}</li>`;
    }).join('<li class="g-step-line" aria-hidden="true"></li>')}</ol>`;
  }

  function shellHTML(S) {
    return `<div class="v-guided">
      <header class="g-top">
        <div class="g-brand"><span class="g-brand-mark" aria-hidden="true"></span>Deep Tech Classifier</div>
        <nav class="g-stepper" aria-label="Steps" data-ref="stepper">${stepperHTML(S)}</nav>
        <div class="g-top-right" data-ref="topright">${topRightHTML(S)}</div>
      </header>
      <main class="g-scroll" data-ref="scroll">
        <div class="g-page g-enter" data-ref="page">${screenHTML(S)}</div>
      </main>
      <div class="g-toasts" data-ref="toasts" aria-live="polite"></div>
    </div>`;
  }

  function topRightHTML(S) {
    const idle = S.screen === 'results' || (S.screen === 'run' && S.run && S.run.status !== 'running');
    if (idle) return `<button type="button" class="g-btn g-btn-ghost g-btn-sm" data-action="new-run">Start a new run</button>`;
    return '';
  }

  function screenHTML(S) {
    switch (S.screen) {
      case 'file': return fileScreen(S);
      case 'columns': return columnsScreen(S);
      case 'settings': return settingsScreen(S);
      case 'run': return runScreen(S);
      case 'results': return resultsScreen(S);
      default: return '';
    }
  }

  /* ---- 1. File ---- */

  function fileScreen(S) {
    const unfinished = S.runs.filter((r) => r.status === 'stopped').map((r) => ({ kind: 'session', r }))
      .concat(S.past.filter((r) => r.status === 'interrupted').map((r) => ({ kind: 'past', r })));
    const notice = unfinished.length ? (() => {
      const u = unfinished[0];
      const done = u.kind === 'session' ? u.r.offset + u.r.results.length : u.r.done;
      const total = u.kind === 'session' ? u.r.total : u.r.total;
      const when = u.kind === 'session' ? 'earlier today' : 'on ' + u.r.date;
      const fname = u.kind === 'session' ? u.r.fileName : u.r.file;
      const act = u.kind === 'session' ? `data-action="resume-run" data-run="${u.r.id}"` : `data-action="resume-past" data-id="${u.r.id}"`;
      return `<div class="g-notice">
        <div><strong>You have an unfinished run.</strong> ${esc(fname)} stopped at ${done} of ${total} companies ${when}. Finished results are saved.</div>
        <button type="button" class="g-btn g-btn-secondary g-btn-sm" ${act}>Resume it</button>
      </div>`;
    })() : '';

    const picker = S.file
      ? `<div class="g-filecard">
          <span class="g-filecard-icon">${ICON.file}</span>
          <div class="g-filecard-text">
            <div class="g-filecard-name">${esc(S.file.name)}</div>
            <div class="g-muted">${plural(S.file.rows, 'company', 'companies')} found &middot; ${S.file.headers.length} columns${S.file.skipped ? ` &middot; ${S.file.skipped} empty rows skipped` : ''}</div>
            ${S.fileNote ? `<div class="g-filecard-note">${esc(S.fileNote)}</div>` : ''}
          </div>
          <button type="button" class="g-btn g-btn-ghost g-btn-sm" data-action="clear-file">Choose a different file</button>
        </div>`
      : `<label class="g-drop" data-ref="drop">
          <input type="file" class="g-visually-hidden" accept=".xlsx,.xls,.csv" data-ref="fileinput">
          <span class="g-drop-icon">${ICON.upload}</span>
          <span class="g-drop-title">Drop your spreadsheet here, or click to choose it</span>
          <span class="g-muted">Excel (.xlsx, .xls) or CSV, one company per row</span>
        </label>
        <p class="g-or">No file to hand? <button type="button" class="g-link" data-action="use-sample">Use the sample file</button> <span class="g-muted">(${D.file.rows} Singapore startups)</span></p>`;

    return `
      <h1 class="g-h1" tabindex="-1">Which companies should we classify?</h1>
      <p class="g-lede">Choose a spreadsheet with one company per row. We will sort each one into deep tech or general tech and tell you which results need a person to look at.</p>
      ${notice}
      ${picker}
      <div class="g-actions">
        <span></span>
        <button type="button" class="g-btn g-btn-primary" data-action="step" data-step="columns" ${S.file ? '' : 'disabled'}>Continue ${ICON.arrowR}</button>
      </div>
      ${recentRunsHTML(S)}
    `;
  }

  function recentRunsHTML(S) {
    const rows = [];
    S.runs.forEach((r) => {
      const t = tally(r);
      if (r.status === 'running') return;
      const line = r.status === 'complete'
        ? `${plural(r.total, 'company', 'companies')} &middot; ${t.deep} deep tech &middot; ${t.pending ? t.pending + ' to review' : 'all settled'} &middot; ${money(t.cost)}`
        : `Stopped at ${t.done} of ${r.total} &middot; ${t.deep} deep tech so far`;
      const acts = r.status === 'complete'
        ? `<button type="button" class="g-btn g-btn-secondary g-btn-sm" data-action="open-run" data-run="${r.id}">Open results</button>`
        : `<button type="button" class="g-btn g-btn-ghost g-btn-sm" data-action="open-run" data-run="${r.id}">See results so far</button>
           <button type="button" class="g-btn g-btn-secondary g-btn-sm" data-action="resume-run" data-run="${r.id}">Resume</button>`;
      rows.push(runRow(r.fileName, r.date + ' &middot; this session', line, acts, r.status));
    });
    S.past.forEach((r) => {
      const line = r.status === 'complete'
        ? `${plural(r.total, 'company', 'companies')} &middot; ${r.deep} deep tech &middot; ${r.review} to review &middot; ${money(r.cost)}`
        : `Stopped at ${r.done} of ${r.total} companies`;
      const acts = r.status === 'complete'
        ? `<button type="button" class="g-btn g-btn-ghost g-btn-sm" data-action="download-past" data-id="${r.id}">${ICON.download} Download Excel</button>`
        : `<button type="button" class="g-btn g-btn-secondary g-btn-sm" data-action="resume-past" data-id="${r.id}">Resume</button>`;
      rows.push(runRow(r.file, r.date, line, acts, r.status));
    });
    if (!rows.length) return '';
    return `<section class="g-section g-recent">
      <h2 class="g-h2">Recent runs</h2>
      <ul class="g-runlist">${rows.join('')}</ul>
    </section>`;
  }

  function runRow(file, date, line, acts, status) {
    const badge = status === 'complete' ? '' : '<span class="g-pill g-pill-warn">Unfinished</span>';
    return `<li class="g-runrow">
      <div class="g-runrow-main">
        <div class="g-runrow-name">${esc(file)} ${badge}</div>
        <div class="g-muted">${date} &middot; ${line}</div>
      </div>
      <div class="g-runrow-acts">${acts}</div>
    </li>`;
  }

  /* ---- 2. Columns ---- */

  function columnsScreen(S) {
    const errs = mappingErrors(S.mapping);
    const detected = FIELDS.every((f) => (S.mapping[f.key] || null) === (D.file.mapping[f.key] || null));
    const used = Object.values(S.mapping).filter(Boolean);
    const extra = S.file.headers.filter((h) => used.indexOf(h) === -1);
    const rows = FIELDS.map((f) => `
      <div class="g-maprow">
        <div class="g-maprow-text">
          <label class="g-maprow-label" for="g-map-${f.key}">${f.label}</label>
          <div class="g-muted">${f.help}</div>
        </div>
        <div class="g-maprow-pick">
          <div class="g-select">
            <select id="g-map-${f.key}" data-field="${f.key}">
              <option value="">${f.required ? 'Choose a column' : 'Not in my file'}</option>
              ${S.file.headers.map((h) => `<option value="${esc(h)}" ${S.mapping[f.key] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}
            </select>
          </div>
          <div class="g-maprow-sample">${S.mapping[f.key] ? sampleValues(S.mapping[f.key]) : '<span class="g-muted">Not used</span>'}</div>
        </div>
      </div>`).join('');
    return `
      <h1 class="g-h1" tabindex="-1">Check the columns we found</h1>
      <p class="g-lede">${detected ? 'We matched your columns automatically.' : 'You have changed the automatic match.'} If any of these look wrong, pick the right column.</p>
      <div class="g-card g-maplist">${rows}</div>
      ${errs.length ? `<div class="g-error" role="alert">${errs.map(esc).join('<br>')}</div>` : ''}
      ${extra.length ? `<p class="g-muted g-note">${extra.map((h) => `<span class="g-sample">${esc(h)}</span>`).join(', ')} will be copied into the results unchanged.</p>` : ''}
      <div class="g-actions">
        <button type="button" class="g-btn g-btn-ghost" data-action="step" data-step="file">${ICON.arrowL} Back</button>
        <button type="button" class="g-btn g-btn-primary" data-action="step" data-step="settings" ${errs.length ? 'disabled' : ''}>Looks right ${ICON.arrowR}</button>
      </div>`;
  }

  /* ---- 3. Settings ---- */

  function settingsScreen(S) {
    const s = S.settings;
    const prov = provider(s.provider);
    const est = estimate(s, S.file.rows);
    const isDefault = ['provider', 'tier', 'enrichment', 'epo', 'validator', 'batch', 'validatorThreshold', 'overrideMinConfidence', 'epoAdjustMax', 'lowEvidenceCap', 'maxWebSearches']
      .every((k) => s[k] === D.defaults[k]);

    const providers = D.providers.map((p) => {
      const sel = p.id === s.provider;
      const status = p.keySet
        ? `<span class="g-keyok">${ICON.check} Key set up</span> &middot; ${p.batch ? 'offers cheaper batch mode' : 'one company at a time'}`
        : '<span class="g-keymissing">No key set up yet</span>';
      const help = !p.keySet
        ? `<button type="button" class="g-link g-link-sm" data-action="key-help" aria-expanded="${S.keyHelp}">How to set it up</button>`
        : '';
      return `<div class="g-choice-wrap">
        <label class="g-choice ${sel ? 'is-selected' : ''} ${p.keySet ? '' : 'is-unavailable'}">
          <input type="radio" name="g-provider" value="${p.id}" ${sel ? 'checked' : ''} ${p.keySet ? '' : 'disabled'}>
          <span class="g-choice-title">${p.label}</span>
          <span class="g-choice-line">${status}</span>
        </label>
        ${help}
      </div>`;
    }).join('');
    const missing = D.providers.find((p) => !p.keySet);
    const keyHelp = S.keyHelp && missing ? `<div class="g-hint g-pop" role="note">
        ${missing.label} needs an API key before it can be used. Whoever installed this tool can add one: it goes in the <code>.env</code> file as <code>${missing.keyVar}</code>. Until then, ${D.providers.filter((p) => p.keySet).map((p) => p.label).join(' or ')} will work just as well.
      </div>` : '';

    const tiers = TIERS.map((t) => {
      const sel = t.key === s.tier;
      return `<label class="g-choice ${sel ? 'is-selected' : ''}">
        <input type="radio" name="g-tier" value="${t.key}" ${sel ? 'checked' : ''}>
        <span class="g-choice-title">${t.label} <span class="g-choice-price">~${money(D.estCostPerCompany[t.key])} a company</span></span>
        <span class="g-choice-line">${t.line}</span>
        <span class="g-choice-model">Uses ${esc(prov.label)} ${esc(prov.tiers[t.key])}</span>
      </label>`;
    }).join('');

    const toggles = [
      { key: 'enrichment', title: 'Look each company up on the web', line: 'Finds a current description, so an outdated or empty one in your file does not mislead the result. About a third of the cost.' },
      { key: 'epo', title: 'Check patent records', line: 'Searches the European Patent Office. Free, and patents are the strongest evidence of original technology.' },
      { key: 'validator', title: 'Take a second look at unsure results', line: `When confidence is below ${s.validatorThreshold}, a second pass searches the web to confirm or challenge the verdict. Only unsure companies cost extra.` },
      { key: 'batch', title: 'Batch mode', line: prov.batch ? 'Sends every company as one job. Roughly halves the AI cost, but results can take up to an hour.' : `Only Anthropic offers this. ${prov.label} works through companies one at a time.`, off: !prov.batch },
    ].map((t) => {
      const on = t.off ? false : s[t.key];
      return `<label class="g-toggle ${t.off ? 'is-off' : ''}">
        <span class="g-toggle-text">
          <span class="g-toggle-title">${t.title}</span>
          <span class="g-toggle-line">${t.line}</span>
        </span>
        <input type="checkbox" class="g-switch" id="g-t-${t.key}" data-toggle="${t.key}" ${on ? 'checked' : ''} ${t.off ? 'disabled' : ''}>
      </label>`;
    }).join('');

    const noEvidence = !s.enrichment && !S.mapping.description;
    const warn = noEvidence ? `<div class="g-hint g-hint-warn">With no description column and no web lookup, verdicts rest on company names alone and confidence is capped at ${s.lowEvidenceCap}. Expect most companies to need review.</div>` : '';

    const ranges = [
      { key: 'validatorThreshold', label: 'Take a second look below this confidence', min: 50, max: 90, step: 5, unit: '', line: 'Higher catches more mistakes but runs more web searches.' },
      { key: 'overrideMinConfidence', label: 'The second look may change a verdict only if it is at least this sure', min: 50, max: 90, step: 5, unit: '', line: 'Below this, a disagreement is flagged as Contested for you to decide.' },
      { key: 'epoAdjustMax', label: 'Most that patent evidence can move confidence', min: 0, max: 25, step: 1, unit: ' points', line: 'Up when patents agree with the verdict, down when they contradict it.' },
      { key: 'lowEvidenceCap', label: 'Confidence ceiling when there is no description and no patents', min: 40, max: 80, step: 5, unit: '', line: 'Stops a guess from a name alone looking certain.' },
      { key: 'maxWebSearches', label: 'Web searches allowed per second look', min: 1, max: 5, step: 1, unit: '', line: 'More searches find more evidence and cost more.' },
    ].map((r) => `<div class="g-range">
        <div class="g-range-head"><label for="g-r-${r.key}">${r.label}</label><output data-out="${r.key}">${s[r.key]}${r.unit}</output></div>
        <input type="range" id="g-r-${r.key}" data-range="${r.key}" data-unit="${r.unit}" min="${r.min}" max="${r.max}" step="${r.step}" value="${s[r.key]}">
        <div class="g-muted g-range-line">${r.line}</div>
      </div>`).join('');

    return `
      <h1 class="g-h1" tabindex="-1">How should we run it?</h1>
      <p class="g-lede">We have picked settings that suit most lists. You can start now, or adjust anything below.</p>

      <div class="g-estimate" data-ref="estimate">
        <div class="g-estimate-text">
          <div class="g-estimate-kicker">${plural(S.file.rows, 'company', 'companies')} &middot; ${esc(prov.label)}, ${TIERS.find((t) => t.key === s.tier).label}${isDefault ? ' &middot; recommended settings' : ''}</div>
          <div class="g-estimate-main" data-ref="est-main">About <strong>${money(est.cost)}</strong> and ${duration(est.secs)}</div>
          <div class="g-muted" data-ref="est-sub">Could be ${money(est.low)} to ${money(est.high)}, depending on how many web searches are needed.${est.batch ? ' Batch jobs occasionally take up to an hour.' : ''}</div>
        </div>
        <button type="button" class="g-btn g-btn-primary g-btn-lg" data-action="start-run">Start run ${ICON.arrowR}</button>
      </div>

      ${warn}

      <section class="g-section">
        <h2 class="g-h2">Which AI service</h2>
        <div class="g-choices g-choices-3">${providers}</div>
        ${keyHelp}
      </section>

      <section class="g-section">
        <h2 class="g-h2">How careful should it be?</h2>
        <div class="g-choices g-choices-3">${tiers}</div>
      </section>

      <section class="g-section">
        <h2 class="g-h2">Checks</h2>
        <div class="g-card g-toggles">${toggles}</div>
      </section>

      <section class="g-section">
        <button type="button" class="g-disclosure" data-action="toggle-advanced" aria-expanded="${S.advancedOpen}" aria-controls="g-adv">
          <span class="g-disclosure-chev">${ICON.chevron}</span> Advanced: when to double-check and how much evidence counts
        </button>
        ${S.advancedOpen ? `<div class="g-card g-advanced g-pop" id="g-adv">
          ${ranges}
          <div class="g-advanced-foot"><button type="button" class="g-btn g-btn-ghost g-btn-sm" data-action="reset-advanced">Reset to recommended</button></div>
        </div>` : ''}
      </section>

      <div class="g-actions">
        <button type="button" class="g-btn g-btn-ghost" data-action="step" data-step="columns">${ICON.arrowL} Back</button>
        <button type="button" class="g-btn g-btn-primary" data-action="start-run">Start run ${ICON.arrowR}</button>
      </div>`;
  }

  /* ---- 4. Run ---- */

  function runScreen(S) {
    const run = S.run;
    const t = tally(run);
    const prov = provider(run.settings.provider);
    const sub = `${esc(run.fileName)} &middot; ${esc(prov.label)}, ${TIERS.find((x) => x.key === run.settings.tier).label}${run.model ? ` (${esc(run.model)})` : ''}`;

    if (run.status === 'stopped') {
      const left = run.total - t.done;
      return `
        <h1 class="g-h1" tabindex="-1">Run paused</h1>
        <p class="g-lede">${t.done} of ${run.total} companies are finished and saved. Nothing is lost: resume whenever you are ready and it will carry on with the remaining ${plural(left, 'company', 'companies')}.</p>
        ${progressBlock(run, t, false)}
        ${countsBlock(t, run)}
        <div class="g-actions">
          <button type="button" class="g-btn g-btn-secondary" data-action="open-run" data-run="${run.id}" ${run.results.length ? '' : 'disabled'}>See the ${run.results.length} results so far</button>
          <button type="button" class="g-btn g-btn-primary" data-action="resume-run" data-run="${run.id}">Resume run ${ICON.arrowR}</button>
        </div>`;
    }

    if (run.status === 'complete') {
      return `
        <h1 class="g-h1" tabindex="-1">All ${run.total} companies are done</h1>
        <p class="g-lede">${sub}</p>
        ${progressBlock(run, t, false)}
        ${countsBlock(t, run)}
        <div class="g-actions">
          <span></span>
          <button type="button" class="g-btn g-btn-primary g-btn-lg" data-action="see-results" data-fk="see-results">See the results ${ICON.arrowR}</button>
        </div>`;
    }

    return `
      <h1 class="g-h1" tabindex="-1">Classifying ${plural(run.total, 'company', 'companies')}</h1>
      <p class="g-lede">${sub}</p>
      ${run.offset ? `<p class="g-muted g-note">Resumed: the first ${run.offset} were finished on an earlier day and are already saved. Resumed runs always use the same model as before.</p>` : ''}
      ${progressBlock(run, t, true)}
      <div class="g-now" aria-live="polite">
        <div class="g-now-kicker">Now working on</div>
        <div class="g-now-name" data-ref="now-name">&nbsp;</div>
        <div class="g-now-step" data-ref="now-step">&nbsp;</div>
        <ol class="g-pipeline" data-ref="pipeline">${STEP_SHORT.map(([k, l]) => `<li data-pstep="${k}">${l}</li>`).join('')}</ol>
      </div>
      ${countsBlock(t, run)}
      <div class="g-finished">
        <div class="g-finished-head">Just finished</div>
        <ul class="g-finished-list" data-ref="finished"><li class="g-muted">Nothing yet</li></ul>
      </div>
      <div class="g-actions">
        <p class="g-muted g-actions-note">Progress is saved after every company. ${run.settings.batch && prov.batch ? 'In a real batch run the classification step waits on Anthropic, which can take up to an hour; you can close this window and come back.' : 'You can stop at any time and resume later.'}</p>
        <button type="button" class="g-btn g-btn-secondary" data-action="stop-run">Stop</button>
      </div>`;
  }

  function progressBlock(run, t, live) {
    const p = run.total ? t.done / run.total : 0;
    return `<div class="g-progress">
      <div class="g-progress-head">
        <span class="g-progress-count"><strong data-ref="done">${t.done}</strong> of ${run.total}</span>
        <span class="g-muted" data-ref="eta">${live ? '' : run.status === 'complete' ? 'Finished' : 'Paused'}</span>
      </div>
      <div class="g-bar" role="progressbar" aria-label="Companies classified" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${t.done}" data-ref="bar">
        <div class="g-bar-fill" data-ref="barfill" style="transform: scaleX(${p})"></div>
      </div>
    </div>`;
  }

  function countsBlock(t, run) {
    return `<dl class="g-counts">
      <div><dt>Deep tech</dt><dd data-ref="c-deep" class="g-c-deep">${t.deep}</dd></div>
      <div><dt>General tech</dt><dd data-ref="c-general">${t.general}</dd></div>
      <div><dt>Need your review</dt><dd data-ref="c-review" class="g-c-review">${t.flagged}</dd></div>
      <div><dt>Cost ${run.offset ? 'this session' : 'so far'}</dt><dd data-ref="c-cost">${money(t.cost)}</dd></div>
    </dl>`;
  }

  /* ---- 5. Results ---- */

  function resultsScreen(S) {
    const run = S.run;
    const t = tally(run);
    const fl = flagged(run);
    const tabs = [
      ['summary', 'Summary'],
      ['review', `Review flagged${t.flagged ? ` (${t.pending})` : ''}`],
      ['list', `All companies (${run.results.length})`],
    ];
    const activeTab = S.view === 'detail' ? 'list' : S.view;
    const nav = `<nav class="g-tabs" aria-label="Results">${tabs.map(([k, l]) => `<button type="button" class="g-tab ${activeTab === k ? 'is-active' : ''}" data-action="view" data-view="${k}" ${activeTab === k ? 'aria-current="page"' : ''} ${k === 'review' && !t.flagged ? 'disabled' : ''}>${l}</button>`).join('')}</nav>`;
    const partial = run.status === 'stopped' ? `<div class="g-notice">
        <div><strong>This run is paused at ${t.done} of ${run.total}.</strong> These are the results so far; ${plural(run.total - t.done, 'company', 'companies')} still to classify.</div>
        <button type="button" class="g-btn g-btn-secondary g-btn-sm" data-action="resume-run" data-run="${run.id}">Resume run</button>
      </div>` : '';
    let body = '';
    if (S.view === 'summary') body = summaryView(S, run, t, fl);
    else if (S.view === 'review') body = reviewView(S, run, t, fl);
    else if (S.view === 'list') body = listView(S, run, t, fl);
    else if (S.view === 'detail') body = detailView(S, run);
    return nav + partial + body;
  }

  function headline(t) {
    if (!t.flagged) return `All ${t.done} are clear`;
    if (!t.pending) return `All ${t.done} are settled`;
    return `${t.clear} clear, ${t.pending} need${t.pending === 1 ? 's' : ''} your review`;
  }

  function summaryView(S, run, t, fl) {
    const deepPct = t.done ? (t.deep / t.done) * 100 : 0;
    const finished = run.finishedAt ? dateParts(run.finishedAt) : null;
    const subBits = [`${plural(t.done, 'company', 'companies')} from ${esc(run.fileName)}`];
    if (finished) subBits.push(`finished ${finished.label}, ${finished.time}`);
    subBits.push(`cost ${money(t.cost)}${run.offset ? ' this session' : ''}`);
    const decidedLine = t.decided ? `<p class="g-lede">You have decided ${t.decided} of the ${t.flagged} flagged ${t.flagged === 1 ? 'company' : 'companies'}. The counts below include your decisions.</p>` : '';

    const flaggedCard = fl.length ? `<section class="g-section">
        <h2 class="g-h2">${t.pending ? 'These need a person to decide' : 'Flagged companies, all decided'}</h2>
        <p class="g-muted g-h2-sub">The classifier was not sure enough about these to settle them on its own. Each takes a minute or two.</p>
        <ul class="g-flaglist">${fl.map((c, i) => {
          const d = run.decisions[c.id];
          return `<li><button type="button" class="g-flagrow" data-action="review-at" data-i="${i}">
            <span class="g-flagrow-main">
              <span class="g-flagrow-name">${esc(c.name)}</span>
              <span class="g-muted">${esc(whyFlagged(c, run.settings).title)}</span>
            </span>
            ${d ? `<span class="g-pill g-pill-done">${ICON.check} ${d.agreed ? 'Kept' : 'Changed to'} ${verdictLabel(d.verdict).toLowerCase()}</span>` : riskPill(c.risk)}
            <span class="g-flagrow-chev">${ICON.chevron}</span>
          </button></li>`;
        }).join('')}</ul>
        <div class="g-actions g-actions-tight">
          <span></span>
          <button type="button" class="g-btn g-btn-primary" data-action="view" data-view="review">${t.pending ? `Review ${t.pending === fl.length ? 'them' : 'the rest'} one by one` : 'Look over them again'} ${ICON.arrowR}</button>
        </div>
      </section>` : '';

    return `
      <h1 class="g-h1 g-h1-big" tabindex="-1">${headline(t)}</h1>
      <p class="g-lede">${subBits.join(' &middot; ')}</p>
      ${decidedLine}
      <div class="g-split">
        <div class="g-split-legend">
          <div><span class="g-dot g-dot-deep"></span><strong>${t.deep}</strong> deep tech</div>
          <div><span class="g-dot g-dot-general"></span><strong>${t.general}</strong> general tech</div>
        </div>
        <div class="g-splitbar" aria-hidden="true"><span class="g-splitbar-deep" style="transform: scaleX(${deepPct / 100})"></span></div>
        ${run.offset ? `<div class="g-muted g-note">Includes ${run.offset} companies finished on ${esc(run.resumedFromDate)} (${run.prior.deep} deep tech, ${run.prior.general} general tech, none flagged).</div>` : ''}
      </div>
      ${flaggedCard}
      <section class="g-section">
        <h2 class="g-h2">Take the results with you</h2>
        <p class="g-muted g-h2-sub">The Excel workbook has an Overview sheet, a Management View with flagged companies first, and every detail behind each verdict.</p>
        <div class="g-actions g-actions-tight g-actions-start">
          <button type="button" class="g-btn g-btn-secondary" data-action="download">${ICON.download} Download Excel</button>
          <button type="button" class="g-btn g-btn-ghost" data-action="view" data-view="list">See all ${run.results.length} companies</button>
        </div>
      </section>`;
  }

  function reviewView(S, run, t, fl) {
    if (!fl.length) return `<h1 class="g-h1" tabindex="-1">Nothing to review</h1><p class="g-lede">Every company in this run came out clear.</p>`;
    if (S.reviewIdx >= fl.length) {
      const left = fl.filter((c) => !run.decisions[c.id]);
      return `<div class="g-donecard">
        <h1 class="g-h1" tabindex="-1">${left.length ? `You have been through all ${fl.length}` : `All ${fl.length} flagged companies are decided`}</h1>
        <p class="g-lede">${left.length ? `${plural(left.length, 'company', 'companies')} still ${left.length === 1 ? 'needs' : 'need'} a decision: ${left.map((c) => esc(c.name)).join(', ')}.` : `The counts now read ${t.deep} deep tech and ${t.general} general tech, and your decisions and notes will be in the Excel file.`}</p>
        <div class="g-actions g-actions-start">
          ${left.length ? `<button type="button" class="g-btn g-btn-primary" data-action="review-at" data-i="${fl.indexOf(left[0])}">Go to ${esc(left[0].name)}</button>` : `<button type="button" class="g-btn g-btn-primary" data-action="download">${ICON.download} Download Excel</button>`}
          <button type="button" class="g-btn g-btn-secondary" data-action="view" data-view="summary">Back to summary</button>
          <button type="button" class="g-btn g-btn-ghost" data-action="view" data-view="list">See all companies</button>
        </div>
      </div>`;
    }
    const i = S.reviewIdx;
    const c = fl[i];
    const dots = fl.map((x, j) => `<button type="button" class="g-rdot ${j === i ? 'is-current' : ''} ${run.decisions[x.id] ? 'is-done' : ''}" data-action="review-at" data-i="${j}" aria-label="${esc(x.name)}${run.decisions[x.id] ? ', decided' : ''}" ${j === i ? 'aria-current="step"' : ''}></button>`).join('');
    return `
      <div class="g-reviewhead">
        <span class="g-muted">Flagged company ${i + 1} of ${fl.length}</span>
        <span class="g-rdots">${dots}</span>
      </div>
      ${companyDetail(c, run, 'review')}
      <div class="g-actions">
        <button type="button" class="g-btn g-btn-ghost" data-action="review-prev" ${i === 0 ? 'disabled' : ''}>${ICON.arrowL} Previous</button>
        <button type="button" class="g-btn g-btn-ghost" data-action="review-skip">${i === fl.length - 1 ? 'Finish' : 'Skip for now'} ${ICON.arrowR}</button>
      </div>`;
  }

  function listView(S, run, t, fl) {
    const pending = fl.filter((c) => !run.decisions[c.id]);
    const decided = fl.filter((c) => run.decisions[c.id]);
    const clearDeep = run.results.filter((c) => c.risk === 'Clear' && c.verdict === 'deep tech').sort((a, b) => b.confidence - a.confidence);
    const clearGen = run.results.filter((c) => c.risk === 'Clear' && c.verdict !== 'deep tech').sort((a, b) => b.confidence - a.confidence);
    const group = (title, sub, list) => list.length ? `<section class="g-section">
        <h2 class="g-h2">${title} <span class="g-count">${list.length}</span></h2>
        ${sub ? `<p class="g-muted g-h2-sub">${sub}</p>` : ''}
        <ul class="g-colist">${list.map((c) => coRow(c, run)).join('')}</ul>
      </section>` : '';
    return `
      <h1 class="g-h1" tabindex="-1">All ${plural(run.results.length, 'company', 'companies')}</h1>
      <p class="g-lede">Companies that need you come first. Open any company to see how its verdict was reached.</p>
      ${group('Need your review', 'Not settled by the classifier.', pending)}
      ${group('Decided by you', '', decided)}
      ${group('Deep tech', 'Clear results. The workbook marks these Approve.', clearDeep)}
      ${group('General tech', 'Clear results. The workbook marks these Reject, meaning not deep tech.', clearGen)}
      ${run.offset ? `<p class="g-muted g-note">The ${run.offset} companies finished on ${esc(run.resumedFromDate)} are in the Excel file but not listed here.</p>` : ''}
      <div class="g-actions g-actions-start">
        <button type="button" class="g-btn g-btn-secondary" data-action="download">${ICON.download} Download Excel</button>
      </div>`;
  }

  function coRow(c, run) {
    const d = run.decisions[c.id];
    const v = finalVerdict(run, c);
    const desc = c.webDescription || c.description || 'No description found';
    return `<li><button type="button" class="g-corow" data-action="open-company" data-id="${c.id}">
      <span class="g-corow-main">
        <span class="g-corow-name">${esc(c.name)}</span>
        <span class="g-corow-desc">${esc(desc)}</span>
      </span>
      <span class="g-corow-side">
        ${verdictTag(v)}
        <span class="g-muted g-corow-conf">${d ? 'Your decision' : `Confidence ${c.confidence}`}</span>
      </span>
      <span class="g-flagrow-chev">${ICON.chevron}</span>
    </button></li>`;
  }

  function detailView(S, run) {
    const c = run.results.find((x) => x.id === S.detailId);
    if (!c) return '';
    const back = S.detailBack === 'summary' ? 'summary' : 'list';
    return `
      <button type="button" class="g-link g-back" data-action="view" data-view="${back}">${ICON.arrowL} Back to ${back === 'summary' ? 'summary' : 'all companies'}</button>
      ${companyDetail(c, run, 'detail')}`;
  }

  /* ---- company detail (shared by review walk-through and detail page) ---- */

  function whyFlagged(c, s) {
    const v = c.validator;
    switch (c.risk) {
      case 'Escalate':
        return { title: 'The evidence points both ways', body: 'The second look found conflicting evidence and could not settle the verdict, so it was passed to a person.', detail: v.escalationReason };
      case 'Contested':
        return { title: 'The second look disagreed', body: `It thought this is ${otherVerdict(c.verdict)}, but was only ${v.confidence}% sure. A verdict is changed only at ${s.overrideMinConfidence}% or more, so the original verdict stands until you decide.`, detail: '' };
      case 'Uncertain':
        return { title: 'Still unsure after a second look', body: `Confidence is ${c.confidence}, below the ${s.validatorThreshold} we treat as settled.${c.webStatus === 'not_found' ? ' There was no description in your file and nothing reliable on the web.' : ''}`, detail: '' };
      default:
        return { title: 'No open questions', body: c.verdict === 'deep tech' ? 'The evidence lines up. The workbook marks this Approve.' : 'The evidence lines up. The workbook marks this Reject, meaning not deep tech.', detail: '' };
    }
  }

  function validatorOutcome(c) {
    const v = c.validator;
    if (v.decision === 'ESCALATE_FOR_HUMAN_REVIEW') return 'Could not settle it, so passed it to a person';
    if (v.verdict === 'confirm') return 'Agreed with the verdict';
    if (v.verdict === 'override') return c.disputed ? 'Disagreed, but was not sure enough to change the verdict' : 'Changed the verdict';
    if (v.verdict === 'insufficient_evidence') return 'Found too little evidence to confirm or change the verdict';
    return 'Finished';
  }

  function riskPill(risk) {
    const cls = { Escalate: 'g-pill-escalate', Contested: 'g-pill-contested', Uncertain: 'g-pill-uncertain', Clear: 'g-pill-clear' }[risk];
    return `<span class="g-pill ${cls}">${risk}</span>`;
  }

  function verdictTag(v) {
    return `<span class="g-verdict ${v === 'deep tech' ? 'is-deep' : 'is-general'}">${verdictLabel(v)}</span>`;
  }

  function companyDetail(c, run, mode) {
    const s = run.settings;
    const why = whyFlagged(c, s);
    const flaggedCo = c.risk !== 'Clear';
    const d = run.decisions[c.id];
    const desc = c.webDescription || c.description;
    const descSource = c.webDescription ? `From the web: ${esc(c.webSource)}` : c.description ? 'From your file' : '';
    const v = c.validator;
    const before = c.signals.llm + c.signals.epoAdjust;
    const valDelta = v.triggered ? c.confidence - before : 0;
    const capped = !c.description && c.patents.count === 0 && c.webStatus === 'not_found';

    const metCount = CRITERIA.filter((k) => c.criteria[k.key].met).length;
    const criteria = CRITERIA.map((k) => {
      const cr = c.criteria[k.key];
      return `<li class="g-crit ${cr.met ? 'is-met' : 'is-unmet'}">
        <span class="g-crit-icon">${cr.met ? ICON.check : ICON.cross}</span>
        <div>
          <div class="g-crit-title">${k.label} <span class="g-crit-state">${cr.met ? 'Met' : 'Not met'}</span></div>
          <div class="g-muted g-crit-ask">${k.ask}</div>
          <div class="g-crit-why">${esc(cr.reasoning)}</div>
        </div>
      </li>`;
    }).join('');

    const patents = c.patents.status === 'no_results' || c.patents.count === 0
      ? `<p class="g-plain">No patents found under this name at the European Patent Office.</p>`
      : `<p class="g-plain">${plural(c.patents.count, 'patent')} found${c.patents.domain ? `, mostly in ${esc(c.patents.domain.toLowerCase())}` : ''}. Rated <strong>${esc(c.patents.level)}</strong> as evidence of deep tech.</p>
         <ul class="g-cpc">${c.patents.cpc.map((p) => `<li><code>${esc(p.code)}</code> ${esc(p.desc)}</li>`).join('')}</ul>`;

    const second = v.triggered
      ? `<p class="g-plain"><strong>${validatorOutcome(c)}.</strong> ${esc(v.summary)}</p>
         ${v.escalationReason ? `<p class="g-plain">Reason given: ${esc(v.escalationReason)}</p>` : ''}
         ${v.sources.length ? `<div class="g-sources"><span class="g-muted">Sources it read</span><ul>${v.sources.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`
      : `<p class="g-plain g-muted">Not needed. Confidence was ${c.confidence}, above the ${s.validatorThreshold} that triggers a second look.</p>`;

    const chips = `<div class="g-build" aria-label="How the confidence was built">
      <span class="g-build-chip"><span class="g-build-k">Classifier</span><span class="g-build-v">${c.signals.llm}</span></span>
      <span class="g-build-op" aria-hidden="true">${c.signals.epoAdjust >= 0 ? '+' : '−'}</span>
      <span class="g-build-chip"><span class="g-build-k">Patents</span><span class="g-build-v">${Math.abs(c.signals.epoAdjust)}</span></span>
      <span class="g-build-op" aria-hidden="true">${v.triggered ? (valDelta >= 0 ? '+' : '−') : ''}</span>
      <span class="g-build-chip ${v.triggered ? '' : 'is-muted'}"><span class="g-build-k">Second look</span><span class="g-build-v">${v.triggered ? Math.abs(valDelta) : 'not needed'}</span></span>
      <span class="g-build-op" aria-hidden="true">=</span>
      <span class="g-build-chip is-total"><span class="g-build-k">Confidence</span><span class="g-build-v">${c.confidence}</span></span>
    </div>
    <p class="g-muted g-build-note">The classifier rated its own verdict ${c.signals.llm}. Patent evidence ${c.signals.epoAdjust ? `moved it ${signed(c.signals.epoAdjust)}` : 'did not move it'}${v.triggered ? `, and the second look ${valDelta ? `moved it ${signed(valDelta)}` : 'left it unchanged'}` : ''}.${capped ? ` With no description and no patents, confidence cannot go above ${s.lowEvidenceCap}.` : ''}</p>`;

    const decision = flaggedCo ? decisionForm(c, d, mode) : '';

    return `<article class="g-co ${mode === 'review' ? 'g-co-review' : ''}">
      <header class="g-co-head">
        <h1 class="g-h1" tabindex="-1">${esc(c.name)}</h1>
        <div class="g-muted">${esc(c.domain)} &middot; UEN ${esc(c.uen)}</div>
        ${desc ? `<p class="g-co-desc">${esc(desc)}</p><div class="g-muted g-co-src">${descSource}</div>` : `<p class="g-co-desc g-muted">No description in your file, and nothing reliable found on the web.</p>`}
      </header>

      <div class="g-verdictbox ${flaggedCo ? 'is-flagged' : ''}">
        <div class="g-verdictbox-top">
          <div>
            <div class="g-muted g-small">Verdict</div>
            <div class="g-verdictbox-v">${verdictTag(c.verdict)}${d && d.verdict !== c.verdict ? ` <span class="g-muted g-small">you changed it to</span> ${verdictTag(d.verdict)}` : ''}</div>
          </div>
          <div>
            <div class="g-muted g-small">Confidence</div>
            <div class="g-verdictbox-conf"><strong>${c.confidence}</strong> <span class="g-muted">${confWord(c.confidence)}</span></div>
          </div>
          <div>
            <div class="g-muted g-small">Flag</div>
            <div>${riskPill(c.risk)}</div>
          </div>
        </div>
        <div class="g-why">
          <div class="g-why-title">${flaggedCo ? 'Why this needs you: ' : ''}${esc(why.title)}</div>
          <p>${esc(why.body)}</p>
          ${why.detail ? `<p class="g-why-detail">${esc(why.detail)}</p>` : ''}
          <p class="g-muted">${esc(c.reasoning)}</p>
        </div>
      </div>

      ${mode === 'review' ? decision : ''}

      <section class="g-co-sec">
        <h2 class="g-h3">The three tests <span class="g-muted g-small">${metCount} of 3 met &middot; deep tech needs all three</span></h2>
        <ul class="g-crits">${criteria}</ul>
      </section>

      <section class="g-co-sec">
        <h2 class="g-h3">How confident, and why</h2>
        ${chips}
      </section>

      <section class="g-co-sec">
        <h2 class="g-h3">Patents</h2>
        ${patents}
      </section>

      <section class="g-co-sec">
        <h2 class="g-h3">Second look</h2>
        ${second}
      </section>

      ${mode !== 'review' ? decision : ''}
    </article>`;
  }

  function decisionForm(c, d, mode) {
    const keepLabel = `Keep it as ${verdictLabel(c.verdict).toLowerCase()}`;
    const changeLabel = `Change it to ${otherVerdict(c.verdict)}`;
    const choice = d ? (d.agreed ? 'keep' : 'change') : '';
    return `<form class="g-decide" data-ref="decide" data-id="${c.id}" data-mode="${mode}" novalidate>
      <fieldset>
        <legend class="g-h3">Your decision</legend>
        ${d ? `<p class="g-saved">${ICON.check} Saved: ${d.agreed ? 'kept as' : 'changed to'} ${verdictLabel(d.verdict).toLowerCase()}. You can change it below.</p>` : ''}
        <div class="g-decide-opts">
          <label class="g-choice ${choice === 'keep' ? 'is-selected' : ''}">
            <input type="radio" name="g-dec-${c.id}" value="keep" ${choice === 'keep' ? 'checked' : ''}>
            <span class="g-choice-title">${keepLabel}</span>
            <span class="g-choice-line">You agree with the classifier.</span>
          </label>
          <label class="g-choice ${choice === 'change' ? 'is-selected' : ''}">
            <input type="radio" name="g-dec-${c.id}" value="change" ${choice === 'change' ? 'checked' : ''}>
            <span class="g-choice-title">${changeLabel}</span>
            <span class="g-choice-line">You overrule it. Your verdict goes in the counts and the workbook.</span>
          </label>
        </div>
        <label class="g-notelabel" for="g-note-${c.id}">Note for the record <span class="g-muted">(optional)</span></label>
        <textarea id="g-note-${c.id}" class="g-note-input" rows="2" placeholder="For example: spoke to the founder; the models are licensed, not original">${d ? esc(d.note) : ''}</textarea>
        <div class="g-decide-msg" data-ref="decide-msg" role="alert"></div>
        <div class="g-decide-foot">
          <button type="submit" class="g-btn g-btn-primary">${mode === 'review' ? 'Save and go to the next' : 'Save decision'}</button>
        </div>
      </fieldset>
    </form>`;
  }

  /* ------------------------------------------------------------------ */
  /* CSS                                                                  */
  /* ------------------------------------------------------------------ */

  const css = `
.v-guided {
  height: 100%; display: flex; flex-direction: column;
  background: var(--bg); color: var(--text); font-family: var(--font); font-size: 15px; line-height: 1.5;
}
.v-guided *:focus { outline: none; }
.v-guided *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-guided [tabindex="-1"]:focus-visible { outline: none; }
.v-guided .g-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.v-guided .g-muted { color: var(--text-2); }
.v-guided .g-small { font-size: 12.5px; }
.v-guided code { font-family: var(--mono); font-size: 0.88em; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

/* ---- header + stepper ---- */
.v-guided .g-top {
  flex: none; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;
  padding: 14px 28px; background: var(--surface); border-bottom: 1px solid var(--border);
}
.v-guided .g-brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; white-space: nowrap; }
.v-guided .g-brand-mark { width: 18px; height: 18px; border-radius: 5px; background: var(--accent); box-shadow: inset 0 0 0 4px var(--accent-soft); }
.v-guided .g-top-right { justify-self: end; }
.v-guided .g-steps { display: flex; align-items: center; list-style: none; margin: 0; padding: 0; }
.v-guided .g-step-line { width: 28px; height: 1px; background: var(--border-strong); margin: 0 4px; }
.v-guided .g-step-btn {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 6px; border: 0; border-radius: 999px;
  background: transparent; color: var(--text-3); font-size: 13.5px; white-space: nowrap;
}
.v-guided button.g-step-btn { cursor: pointer; color: var(--text-2); transition: background-color 150ms ease-out; }
.v-guided button.g-step-btn:hover { background: var(--surface-2); }
.v-guided button.g-step-btn:active { transform: scale(0.97); }
.v-guided .g-step-dot {
  display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--border-strong); font-size: 12px; font-weight: 600; background: var(--surface);
}
.v-guided .g-step.is-current .g-step-btn { color: var(--text); font-weight: 600; }
.v-guided .g-step.is-current .g-step-dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-guided .g-step.is-done .g-step-dot { background: var(--accent-soft); border-color: transparent; color: var(--accent); }

/* ---- page ---- */
.v-guided .g-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; scroll-padding-top: 16px; }
.v-guided .g-page { max-width: 760px; margin: 0 auto; padding: 44px 28px 140px; }
.v-guided .g-enter { animation: guided-in 260ms var(--ease-out) both; }
@keyframes guided-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.v-guided .g-pop { animation: guided-pop 200ms var(--ease-out) both; transform-origin: top center; }
@keyframes guided-pop { from { opacity: 0; transform: translateY(-4px) scale(0.99); } to { opacity: 1; transform: none; } }

.v-guided .g-h1 { font-size: 28px; line-height: 1.2; font-weight: 650; letter-spacing: -0.015em; margin: 0 0 10px; }
.v-guided .g-h1-big { font-size: 34px; }
.v-guided .g-h2 { font-size: 17px; font-weight: 600; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.v-guided .g-h2-sub { margin: -6px 0 14px; font-size: 14px; }
.v-guided .g-h3 { font-size: 15px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0; }
.v-guided .g-lede { font-size: 16px; color: var(--text-2); margin: 0 0 28px; max-width: 62ch; }
.v-guided .g-note { font-size: 13.5px; margin: 14px 0 0; }
.v-guided .g-section { margin-top: 40px; }
.v-guided .g-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l); }
.v-guided .g-count { font-size: 13px; font-weight: 500; color: var(--text-2); background: var(--surface-2); border-radius: 999px; padding: 1px 9px; }

/* ---- buttons ---- */
.v-guided .g-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 18px; border-radius: var(--radius-m); border: 1px solid transparent;
  font-size: 14.5px; font-weight: 550; cursor: pointer; white-space: nowrap;
  transition: background-color 150ms ease-out, border-color 150ms ease-out, transform 120ms var(--ease-out), opacity 150ms ease-out;
}
.v-guided .g-btn:active:not(:disabled) { transform: scale(0.97); }
.v-guided .g-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.v-guided .g-btn-primary { background: var(--accent); color: #fff; }
.v-guided .g-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 88%, #000); }
.v-guided .g-btn-secondary { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
.v-guided .g-btn-secondary:hover:not(:disabled) { background: var(--surface-2); }
.v-guided .g-btn-ghost { background: transparent; color: var(--text-2); }
.v-guided .g-btn-ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
.v-guided .g-btn-sm { height: 32px; padding: 0 12px; font-size: 13.5px; }
.v-guided .g-btn-lg { height: 46px; padding: 0 22px; font-size: 15.5px; }
.v-guided .g-link {
  border: 0; background: none; padding: 0; color: var(--accent); font-weight: 550; cursor: pointer;
  text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 35%, transparent); text-underline-offset: 3px;
  display: inline-flex; align-items: center; gap: 6px; border-radius: 4px;
}
.v-guided .g-link:hover { text-decoration-color: var(--accent); }
.v-guided .g-link:active { opacity: 0.7; }
.v-guided .g-link-sm { font-size: 13px; margin: 6px 0 0 2px; }
.v-guided .g-back { margin-bottom: 18px; text-decoration: none; }

.v-guided .g-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 36px; flex-wrap: wrap; }
.v-guided .g-actions-tight { margin-top: 16px; }
.v-guided .g-actions-start { justify-content: flex-start; }
.v-guided .g-actions-note { margin: 0; font-size: 13.5px; max-width: 52ch; }

/* ---- notices ---- */
.v-guided .g-notice {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 16px; margin: 0 0 24px; border-radius: var(--radius-m);
  background: var(--accent-soft); color: var(--text); font-size: 14px;
}
.v-guided .g-hint { margin-top: 12px; padding: 12px 14px; border-radius: var(--radius-m); background: var(--surface-2); font-size: 14px; color: var(--text-2); }
.v-guided .g-hint-warn { background: var(--uncertain-soft); color: var(--text); margin: 0 0 8px; }
.v-guided .g-error { margin-top: 14px; padding: 12px 14px; border-radius: var(--radius-m); background: var(--error-soft); color: var(--error); font-size: 14px; }

/* ---- file ---- */
.v-guided .g-drop {
  display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
  padding: 44px 24px; border: 1.5px dashed var(--border-strong); border-radius: var(--radius-l);
  background: var(--surface); cursor: pointer;
  transition: border-color 150ms ease-out, background-color 150ms ease-out;
}
.v-guided .g-drop:hover, .v-guided .g-drop.is-over { border-color: var(--accent); background: var(--accent-soft); }
.v-guided .g-drop:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-guided .g-drop:active { transform: scale(0.995); }
.v-guided .g-drop-icon { color: var(--accent); margin-bottom: 4px; }
.v-guided .g-drop-title { font-weight: 600; font-size: 16px; }
.v-guided .g-or { margin: 16px 0 0; text-align: center; font-size: 14.5px; }
.v-guided .g-filecard {
  display: flex; align-items: center; gap: 14px; padding: 18px 18px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-l); animation: guided-pop 220ms var(--ease-out) both;
}
.v-guided .g-filecard-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-m); background: var(--deep-soft); color: var(--deep); flex: none; }
.v-guided .g-filecard-text { flex: 1; min-width: 0; }
.v-guided .g-filecard-name { font-weight: 600; font-size: 16px; overflow-wrap: anywhere; }
.v-guided .g-filecard-note { font-size: 13px; color: var(--text-3); margin-top: 4px; }

.v-guided .g-runlist { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.v-guided .g-runrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 2px; border-bottom: 1px solid var(--border); }
.v-guided .g-runrow-main { min-width: 0; font-size: 14px; }
.v-guided .g-runrow-name { font-weight: 600; font-size: 14.5px; display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
.v-guided .g-runrow-acts { display: flex; gap: 6px; flex: none; }

/* ---- columns ---- */
.v-guided .g-maplist { padding: 4px 20px; }
.v-guided .g-maprow { display: grid; grid-template-columns: 1fr 280px; gap: 24px; align-items: start; padding: 18px 0; border-bottom: 1px solid var(--border); }
.v-guided .g-maprow:last-child { border-bottom: 0; }
.v-guided .g-maprow-label { font-weight: 600; display: block; }
.v-guided .g-maprow-text .g-muted { font-size: 13.5px; }
.v-guided .g-maprow-sample { font-size: 13px; margin-top: 6px; color: var(--text-2); overflow-wrap: anywhere; }
.v-guided .g-sample { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
.v-guided .g-select { position: relative; }
.v-guided .g-select::after {
  content: ""; position: absolute; right: 14px; top: 50%; width: 7px; height: 7px; margin-top: -5px;
  border-right: 1.5px solid var(--text-2); border-bottom: 1.5px solid var(--text-2); transform: rotate(45deg); pointer-events: none;
}
.v-guided .g-select select {
  width: 100%; height: 40px; padding: 0 36px 0 12px; appearance: none; -webkit-appearance: none;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-m); cursor: pointer;
}
.v-guided .g-select select:hover { border-color: var(--text-3); }

/* ---- settings ---- */
.v-guided .g-estimate {
  position: sticky; top: 12px; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 18px 20px; margin-bottom: 24px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-l); box-shadow: var(--shadow-2);
}
.v-guided .g-estimate-kicker { font-size: 13px; color: var(--text-2); }
.v-guided .g-estimate-main { font-size: 20px; margin: 2px 0 2px; }
.v-guided .g-estimate-main strong { font-weight: 650; }
.v-guided .g-estimate .g-muted { font-size: 13px; }
.v-guided .g-tick { animation: guided-tick 240ms var(--ease-out); }
@keyframes guided-tick { from { opacity: 0.35; transform: translateY(3px); } to { opacity: 1; transform: none; } }

.v-guided .g-choices { display: grid; gap: 12px; }
.v-guided .g-choices-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.v-guided .g-choice-wrap { display: flex; flex-direction: column; }
.v-guided .g-choice {
  position: relative; display: flex; flex-direction: column; gap: 4px; height: 100%;
  padding: 14px 16px 14px 44px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-m);
  cursor: pointer; transition: border-color 150ms ease-out, background-color 150ms ease-out, transform 120ms var(--ease-out);
}
.v-guided .g-choice:hover { border-color: var(--border-strong); }
.v-guided .g-choice:active:not(.is-unavailable) { transform: scale(0.985); }
.v-guided .g-choice input { position: absolute; left: 16px; top: 17px; margin: 0; width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.v-guided .g-choice.is-selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface)); box-shadow: 0 0 0 1px var(--accent) inset; }
.v-guided .g-choice.is-unavailable { cursor: default; background: var(--surface-2); }
.v-guided .g-choice.is-unavailable .g-choice-title { color: var(--text-2); }
.v-guided .g-choice.is-unavailable input { cursor: default; }
.v-guided .g-choice-title { font-weight: 600; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.v-guided .g-choice-price { font-weight: 500; font-size: 12.5px; color: var(--text-2); }
.v-guided .g-choice-line { font-size: 13.5px; color: var(--text-2); }
.v-guided .g-choice-model { font-size: 12.5px; color: var(--text-3); margin-top: auto; padding-top: 4px; }
.v-guided .g-keyok { color: var(--deep); display: inline-flex; align-items: center; gap: 3px; }
.v-guided .g-keymissing { color: var(--escalate); }

.v-guided .g-toggles { padding: 0 20px; }
.v-guided .g-toggle { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.v-guided .g-toggle:last-child { border-bottom: 0; }
.v-guided .g-toggle.is-off { cursor: default; }
.v-guided .g-toggle-text { display: flex; flex-direction: column; gap: 2px; }
.v-guided .g-toggle-title { font-weight: 600; }
.v-guided .g-toggle.is-off .g-toggle-title { color: var(--text-2); }
.v-guided .g-toggle-line { font-size: 13.5px; color: var(--text-2); max-width: 54ch; }
.v-guided .g-switch {
  appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 40px; height: 24px; margin: 0;
  border-radius: 999px; background: var(--border-strong); cursor: pointer; transition: background-color 180ms ease-out;
}
.v-guided .g-switch::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform 200ms var(--ease-out);
}
.v-guided .g-switch:checked { background: var(--accent); }
.v-guided .g-switch:checked::after { transform: translateX(16px); }
.v-guided .g-switch:disabled { opacity: 0.5; cursor: not-allowed; }
.v-guided .g-switch:active:not(:disabled)::after { transform: scale(0.92); }
.v-guided .g-switch:checked:active:not(:disabled)::after { transform: translateX(16px) scale(0.92); }

.v-guided .g-disclosure {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 4px; border: 0; background: none;
  color: var(--text-2); font-weight: 550; cursor: pointer; text-align: left; border-radius: var(--radius-s);
}
.v-guided .g-disclosure:hover { color: var(--text); }
.v-guided .g-disclosure:active { opacity: 0.7; }
.v-guided .g-disclosure-chev { display: inline-flex; transition: transform 200ms var(--ease-out); }
.v-guided .g-disclosure[aria-expanded="true"] .g-disclosure-chev { transform: rotate(90deg); }
.v-guided .g-advanced { margin-top: 8px; padding: 6px 20px 12px; }
.v-guided .g-range { padding: 14px 0; border-bottom: 1px solid var(--border); }
.v-guided .g-range-head { display: flex; justify-content: space-between; gap: 16px; font-weight: 550; font-size: 14px; }
.v-guided .g-range-head output { font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 650; }
.v-guided .g-range input { width: 100%; margin: 8px 0 2px; accent-color: var(--accent); cursor: pointer; }
.v-guided .g-range-line { font-size: 13px; }
.v-guided .g-advanced-foot { padding-top: 10px; }

/* ---- run ---- */
.v-guided .g-progress { margin: 8px 0 28px; }
.v-guided .g-progress-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.v-guided .g-progress-count { font-size: 18px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.v-guided .g-progress-count strong { font-size: 30px; color: var(--text); font-weight: 650; }
.v-guided .g-bar { height: 10px; border-radius: 999px; background: var(--surface-2); overflow: hidden; box-shadow: inset 0 0 0 1px var(--border); }
.v-guided .g-bar-fill { height: 100%; width: 100%; background: var(--accent); transform-origin: left center; transition: transform 300ms var(--ease-out); }
.v-guided .g-now { padding: 22px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l); }
.v-guided .g-now-kicker { font-size: 12.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
.v-guided .g-now-name { font-size: 22px; font-weight: 650; margin: 4px 0 2px; }
.v-guided .g-now-step { color: var(--text-2); min-height: 1.5em; }
.v-guided .g-pipeline { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 16px 0 0; }
.v-guided .g-pipeline li {
  font-size: 12.5px; padding: 3px 10px; border-radius: 999px; background: var(--surface-2); color: var(--text-3);
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.v-guided .g-pipeline li.is-done { color: var(--text-2); }
.v-guided .g-pipeline li.is-now { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.v-guided .g-pipeline li.is-skip { text-decoration: line-through; opacity: 0.6; }
.v-guided .g-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 0; }
.v-guided .g-counts > div { padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-m); }
.v-guided .g-counts dt { font-size: 13px; color: var(--text-2); }
.v-guided .g-counts dd { margin: 2px 0 0; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; }
.v-guided .g-counts .g-c-deep { color: var(--deep); }
.v-guided .g-counts .g-c-review { color: var(--escalate); }
.v-guided .g-finished { margin-top: 24px; }
.v-guided .g-finished-head { font-size: 13px; color: var(--text-3); margin-bottom: 6px; }
.v-guided .g-finished-list { list-style: none; margin: 0; padding: 0; min-height: 96px; }
.v-guided .g-finished-list li { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border); }
.v-guided .g-finished-list li > span:first-child { flex: 1; min-width: 0; }
.v-guided .g-finished-list li.is-new { animation: guided-in 240ms var(--ease-out) both; }

/* ---- pills & tags ---- */
.v-guided .g-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
.v-guided .g-pill-escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-guided .g-pill-contested { background: var(--contested-soft); color: var(--contested); }
.v-guided .g-pill-uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-guided .g-pill-clear { background: var(--surface-2); color: var(--text-2); }
.v-guided .g-pill-warn { background: var(--uncertain-soft); color: var(--uncertain); font-weight: 550; }
.v-guided .g-pill-done { background: var(--accent-soft); color: var(--accent); }
.v-guided .g-verdict { display: inline-block; font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
.v-guided .g-verdict.is-deep { background: var(--deep-soft); color: var(--deep); }
.v-guided .g-verdict.is-general { background: var(--general-soft); color: var(--general); }

/* ---- results ---- */
.v-guided .g-tabs { display: inline-flex; gap: 2px; padding: 3px; margin-bottom: 32px; background: var(--surface-2); border-radius: 999px; }
.v-guided .g-tab {
  border: 0; background: transparent; height: 32px; padding: 0 14px; border-radius: 999px; font-size: 13.5px; font-weight: 550;
  color: var(--text-2); cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out;
}
.v-guided .g-tab:hover:not(:disabled) { color: var(--text); }
.v-guided .g-tab:active:not(:disabled) { transform: scale(0.97); }
.v-guided .g-tab.is-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
.v-guided .g-tab:disabled { opacity: 0.45; cursor: default; }
.v-guided .g-split { padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l); }
.v-guided .g-split-legend { display: flex; gap: 28px; font-size: 16px; margin-bottom: 12px; }
.v-guided .g-split-legend strong { font-size: 22px; margin-right: 2px; }
.v-guided .g-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; }
.v-guided .g-dot-deep { background: var(--deep); }
.v-guided .g-dot-general { background: var(--border-strong); }
.v-guided .g-splitbar { height: 12px; border-radius: 999px; overflow: hidden; background: var(--border-strong); }
.v-guided .g-splitbar-deep { display: block; height: 100%; width: 100%; background: var(--deep); transform-origin: left center; transition: transform 300ms var(--ease-out); }

.v-guided .g-flaglist, .v-guided .g-colist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.v-guided .g-flagrow, .v-guided .g-corow {
  display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 14px 16px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-m); cursor: pointer;
  transition: border-color 150ms ease-out, transform 120ms var(--ease-out);
}
.v-guided .g-flagrow:hover, .v-guided .g-corow:hover { border-color: var(--border-strong); }
.v-guided .g-flagrow:active, .v-guided .g-corow:active { transform: scale(0.99); }
.v-guided .g-flagrow-main, .v-guided .g-corow-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 14px; }
.v-guided .g-flagrow-name, .v-guided .g-corow-name { font-weight: 600; font-size: 15px; }
.v-guided .g-corow-desc { color: var(--text-2); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-guided .g-corow-side { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.v-guided .g-corow-conf { font-size: 12.5px; }
.v-guided .g-flagrow-chev { color: var(--text-3); display: inline-flex; flex: none; }

.v-guided .g-reviewhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 14px; }
.v-guided .g-rdots { display: flex; gap: 6px; }
.v-guided .g-rdot { width: 26px; height: 8px; border-radius: 999px; border: 0; padding: 0; background: var(--border-strong); cursor: pointer; transition: background-color 150ms ease-out; }
.v-guided .g-rdot:hover { background: var(--text-3); }
.v-guided .g-rdot:active { transform: scaleY(0.8); }
.v-guided .g-rdot.is-done { background: color-mix(in srgb, var(--accent) 45%, var(--surface)); }
.v-guided .g-rdot.is-current { background: var(--accent); }

.v-guided .g-donecard { padding-top: 12px; }

/* ---- company detail ---- */
.v-guided .g-co-head .g-h1 { margin-bottom: 4px; }
.v-guided .g-co-head > .g-muted { font-size: 14px; }
.v-guided .g-co-desc { font-size: 16px; margin: 14px 0 2px; max-width: 64ch; }
.v-guided .g-co-src { font-size: 12.5px; }
.v-guided .g-verdictbox { margin-top: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l); overflow: hidden; }
.v-guided .g-verdictbox-top { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 20px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.v-guided .g-verdictbox-v { margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.v-guided .g-verdictbox-v .g-verdict { font-size: 15px; padding: 3px 12px; }
.v-guided .g-verdictbox-conf { margin-top: 2px; }
.v-guided .g-verdictbox-conf strong { font-size: 22px; font-weight: 650; margin-right: 4px; }
.v-guided .g-why { padding: 16px 20px; }
.v-guided .g-verdictbox.is-flagged .g-why { background: color-mix(in srgb, var(--contested-soft) 55%, var(--surface)); }
.v-guided .g-why-title { font-weight: 650; margin-bottom: 4px; }
.v-guided .g-why p { margin: 0 0 8px; font-size: 14.5px; }
.v-guided .g-why p:last-child { margin-bottom: 0; }
.v-guided .g-why-detail { padding-left: 12px; border-left: 2px solid var(--border-strong); }
.v-guided .g-co-sec { margin-top: 30px; }
.v-guided .g-plain { margin: 0 0 8px; font-size: 14.5px; }
.v-guided .g-crits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.v-guided .g-crit { display: flex; gap: 12px; }
.v-guided .g-crit-icon { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; margin-top: 1px; }
.v-guided .g-crit.is-met .g-crit-icon { background: var(--deep-soft); color: var(--deep); }
.v-guided .g-crit.is-unmet .g-crit-icon { background: var(--general-soft); color: var(--general); }
.v-guided .g-crit-title { font-weight: 600; }
.v-guided .g-crit-state { font-weight: 500; font-size: 12.5px; color: var(--text-2); margin-left: 6px; }
.v-guided .g-crit-ask { font-size: 13px; }
.v-guided .g-crit-why { font-size: 14.5px; margin-top: 2px; }
.v-guided .g-build { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.v-guided .g-build-chip { display: inline-flex; flex-direction: column; padding: 8px 12px; border-radius: var(--radius-m); background: var(--surface); border: 1px solid var(--border); min-width: 84px; }
.v-guided .g-build-chip.is-muted .g-build-v { font-size: 13px; color: var(--text-3); font-weight: 500; padding-top: 4px; }
.v-guided .g-build-chip.is-total { background: var(--accent-soft); border-color: transparent; }
.v-guided .g-build-k { font-size: 12px; color: var(--text-2); }
.v-guided .g-build-v { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
.v-guided .g-build-op { color: var(--text-3); font-size: 16px; min-width: 8px; text-align: center; }
.v-guided .g-build-note { font-size: 13.5px; margin: 10px 0 0; }
.v-guided .g-cpc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.v-guided .g-sources { margin-top: 8px; font-size: 13.5px; }
.v-guided .g-sources ul { margin: 4px 0 0; padding-left: 18px; font-family: var(--mono); font-size: 12.5px; color: var(--text-2); }

.v-guided .g-decide { margin-top: 24px; padding: 20px; background: var(--surface); border: 1px solid var(--accent); border-radius: var(--radius-l); box-shadow: 0 0 0 3px var(--accent-soft); }
.v-guided .g-co:not(.g-co-review) .g-decide { margin-top: 34px; }
.v-guided .g-decide fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.v-guided .g-decide-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.v-guided .g-notelabel { display: block; margin: 16px 0 6px; font-weight: 550; font-size: 14px; }
.v-guided .g-note-input {
  display: block; width: 100%; resize: vertical; min-height: 60px; padding: 10px 12px; font-size: 14px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-m); background: var(--surface);
}
.v-guided .g-note-input:focus-visible { outline-offset: 0; }
.v-guided .g-decide-msg { color: var(--error); font-size: 13.5px; min-height: 0; }
.v-guided .g-decide-msg:not(:empty) { margin-top: 8px; }
.v-guided .g-decide-foot { display: flex; justify-content: flex-end; margin-top: 14px; }
.v-guided .g-saved { display: flex; align-items: center; gap: 6px; margin: -2px 0 12px; color: var(--accent); font-size: 14px; font-weight: 550; }

/* ---- toasts ---- */
.v-guided .g-toasts { position: fixed; top: 72px; right: 24px; z-index: 50; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.v-guided .g-toast {
  pointer-events: auto; max-width: 380px; padding: 12px 16px; border-radius: var(--radius-m);
  background: var(--text); color: #fff; font-size: 14px; box-shadow: var(--shadow-2);
  animation: guided-toast-in 240ms var(--ease-out) both; transform-origin: top right;
}
.v-guided .g-toast small { display: block; color: rgba(255,255,255,.65); font-size: 12.5px; margin-top: 2px; }
.v-guided .g-toast.is-leaving { opacity: 0; transform: translateY(-4px); transition: opacity 180ms ease-out, transform 180ms ease-out; }
@keyframes guided-toast-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }

/* ---- narrow ---- */
@media (max-width: 1080px) {
  .v-guided .g-top { grid-template-columns: auto 1fr auto; padding: 12px 20px; }
  .v-guided .g-stepper { justify-self: center; }
  .v-guided .g-step-line { width: 14px; }
}
@media (max-width: 960px) {
  .v-guided .g-step-label { display: none; }
  .v-guided .g-step.is-current .g-step-label { display: inline; }
  .v-guided .g-choices-3 { grid-template-columns: 1fr; }
  .v-guided .g-maprow { grid-template-columns: 1fr 240px; }
  .v-guided .g-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .v-guided *, .v-guided *::before, .v-guided *::after { animation: none !important; transition: none !important; }
}
`;

  /* ------------------------------------------------------------------ */
  /* Behaviour                                                            */
  /* ------------------------------------------------------------------ */

  function init(stage) {
    const root = stage.querySelector('.v-guided');
    if (!root) return function () {};
    const S = freshState();
    const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
    const timers = new Set();
    let runTimer = null;
    let lastKey = screenKey();
    let lastEst = '';
    let finishedShown = [];

    function later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    }
    function cancel(id) { if (id != null) { clearTimeout(id); timers.delete(id); } }

    function screenKey() {
      if (S.screen !== 'results') return S.screen + (S.screen === 'run' && S.run ? ':' + S.run.status : '');
      return 'results:' + S.view + ':' + (S.view === 'review' ? S.reviewIdx : S.view === 'detail' ? S.detailId : '');
    }

    /* ---- drawing ---- */

    function draw(opts) {
      const key = screenKey();
      const same = key === lastKey && !(opts && opts.fresh);
      const scroller = ref('scroll');
      const page = ref('page');
      const scrollTop = scroller.scrollTop;
      const active = document.activeElement;
      let focusSel = null;
      if (same && active && root.contains(active)) {
        if (active.id) focusSel = '#' + active.id;
        else if (active.name && active.type === 'radio') focusSel = `input[name="${active.name}"][value="${active.value}"]`;
        else if (active.dataset.fk) focusSel = `[data-fk="${active.dataset.fk}"]`;
        else if (active.dataset.action) focusSel = `[data-action="${active.dataset.action}"]` + (active.dataset.view ? `[data-view="${active.dataset.view}"]` : '') + (active.dataset.step ? `[data-step="${active.dataset.step}"]` : '');
      }

      ref('stepper').innerHTML = stepperHTML(S);
      ref('topright').innerHTML = topRightHTML(S);
      page.innerHTML = screenHTML(S);

      if (same) {
        scroller.scrollTop = scrollTop;
        if (focusSel) { const el = root.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
      } else {
        scroller.scrollTop = 0;
        page.classList.remove('g-enter');
        void page.offsetWidth; // restart the entrance animation
        page.classList.add('g-enter');
        const target = root.querySelector('[data-fk="see-results"]') || page.querySelector('.g-h1');
        if (target) target.focus({ preventScroll: true });
      }
      lastKey = key;

      if (S.screen === 'settings') {
        const main = ref('est-main');
        if (main && lastEst && main.textContent !== lastEst) bump(main);
        if (main) lastEst = main.textContent;
      }
      if (S.screen === 'run' && S.run && S.run.status === 'running') {
        finishedShown = [];
        updateRunView(null);
        updateNow();
      }
    }

    function bump(el) {
      el.classList.remove('g-tick');
      void el.offsetWidth;
      el.classList.add('g-tick');
    }

    function toast(main, sub) {
      const host = ref('toasts');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'g-toast';
      el.setAttribute('role', 'status');
      el.innerHTML = esc(main) + (sub ? `<small>${esc(sub)}</small>` : '');
      host.appendChild(el);
      later(() => {
        el.classList.add('is-leaving');
        later(() => el.remove(), 200);
      }, 3600);
    }

    /* ---- file ---- */

    function loadFile(name, note) {
      S.file = { name: name || D.file.name, rows: D.file.rows, skipped: D.file.skipped, headers: D.file.headers.slice() };
      S.fileNote = note || '';
      S.mapping = Object.assign({}, D.file.mapping);
      draw();
      const next = root.querySelector('[data-action="step"][data-step="columns"]');
      if (next) next.focus({ preventScroll: true });
    }

    /* ---- run engine ---- */

    function newRun() {
      const now = new Date();
      const prov = provider(S.settings.provider);
      const run = {
        id: 'run_' + dateParts(now).stamp + '_' + Math.random().toString(36).slice(2, 6),
        fileName: S.file.name,
        date: dateParts(now).label,
        total: S.file.rows,
        offset: 0,
        prior: { deep: 0, general: 0 },
        queue: D.companies.slice(0, S.file.rows),
        pos: 0,
        results: [],
        status: 'running',
        settings: Object.assign({}, S.settings, { batch: S.settings.batch && prov.batch }),
        model: prov.tiers[S.settings.tier],
        decisions: {},
        current: null,
        finishedAt: null,
      };
      return run;
    }

    function startRun(run) {
      S.run = run;
      if (S.runs.indexOf(run) === -1) S.runs.unshift(run);
      run.status = 'running';
      S.screen = 'run';
      draw();
      nextCompany();
    }

    function nextCompany() {
      const run = S.run;
      if (!run || run.status !== 'running') return;
      if (run.pos >= run.queue.length) return completeRun();
      const c = run.queue[run.pos];
      run.current = { c, steps: activeSteps(c, run.settings), i: 0 };
      updateNow();
      stepOn();
    }

    function stepOn() {
      runTimer = later(() => {
        const run = S.run;
        if (!run || run.status !== 'running' || !run.current) return;
        run.current.i++;
        if (run.current.i < run.current.steps.length) { updateNow(); stepOn(); }
        else finishCompany();
      }, 72);
    }

    function finishCompany() {
      const run = S.run;
      const c = run.current.c;
      run.results.push(c);
      run.pos++;
      run.current = null;
      updateRunView(c);
      nextCompany();
    }

    function completeRun() {
      const run = S.run;
      run.status = 'complete';
      run.finishedAt = new Date();
      run.current = null;
      draw();
    }

    function stopRun() {
      const run = S.run;
      if (!run || run.status !== 'running') return;
      cancel(runTimer);
      runTimer = null;
      run.status = 'stopped';
      run.current = null;
      draw();
      toast(`Run paused at ${run.offset + run.results.length} of ${run.total}`, 'Finished results are saved.');
    }

    function updateNow() {
      const run = S.run;
      if (!run || !run.current || S.screen !== 'run') return;
      const { c, steps, i } = run.current;
      const name = ref('now-name');
      const step = ref('now-step');
      if (name) name.textContent = c.name;
      if (step) step.textContent = STEP_TEXT[steps[i]](c) + '…';
      const pipe = ref('pipeline');
      if (pipe) {
        pipe.querySelectorAll('li').forEach((li) => {
          const k = li.dataset.pstep;
          const idx = steps.indexOf(k);
          li.className = idx === -1 ? 'is-skip' : idx < i ? 'is-done' : idx === i ? 'is-now' : '';
        });
      }
    }

    function updateRunView(justFinished) {
      const run = S.run;
      if (!run || S.screen !== 'run') return;
      const t = tally(run);
      const set = (r, v) => { const el = ref(r); if (el) el.textContent = v; };
      set('done', t.done);
      set('c-deep', t.deep);
      set('c-general', t.general);
      set('c-review', t.flagged);
      set('c-cost', money(t.cost));
      const left = run.total - t.done;
      set('eta', left ? (left * 0.3 < 1.5 ? 'Almost done' : `About ${Math.ceil(left * 0.3)} seconds left`) : 'Finished');
      const fill = ref('barfill');
      if (fill) fill.style.transform = `scaleX(${run.total ? t.done / run.total : 0})`;
      const bar = ref('bar');
      if (bar) bar.setAttribute('aria-valuenow', t.done);

      const list = ref('finished');
      if (!list) return;
      if (justFinished) finishedShown.unshift(justFinished);
      else finishedShown = run.results.slice(-3).reverse();
      finishedShown = finishedShown.slice(0, 3);
      if (!finishedShown.length) { list.innerHTML = '<li class="g-muted">Nothing yet</li>'; return; }
      list.innerHTML = finishedShown.map((c, idx) => `<li class="${idx === 0 && justFinished ? 'is-new' : ''}">
        <span>${esc(c.name)}</span>
        ${c.risk !== 'Clear' ? riskPill(c.risk) : ''}
        ${verdictTag(c.verdict)}
        <span class="g-muted">${c.confidence}</span>
      </li>`).join('');
    }

    function resumePast(id) {
      const p = S.past.find((r) => r.id === id);
      if (!p) return;
      S.past = S.past.filter((r) => r !== p);
      const settings = Object.assign({}, D.defaults);
      const remaining = p.total - p.done;
      const run = {
        id: p.id,
        fileName: p.file,
        date: p.date,
        total: p.total,
        offset: p.done,
        prior: { deep: 7, general: p.done - 7 },
        resumedFromDate: p.date,
        queue: D.companies.slice(D.companies.length - remaining),
        pos: 0,
        results: [],
        status: 'running',
        settings,
        model: p.model,
        decisions: {},
        current: null,
        finishedAt: null,
      };
      S.view = 'summary';
      S.reviewIdx = 0;
      startRun(run);
    }

    /* ---- results ---- */

    function openResults(run, view) {
      S.run = run;
      S.screen = 'results';
      S.view = view || 'summary';
      S.reviewIdx = 0;
      draw();
    }

    function download(fileName, extra) {
      const name = outputName(fileName, new Date());
      toast(`Saved ${name} to Downloads`, (extra ? extra + ' ' : '') + 'Prototype: no file was created.');
    }

    function saveDecision(form) {
      const run = S.run;
      const c = run.results.find((x) => x.id === form.dataset.id);
      if (!c) return;
      const picked = form.querySelector('input[type="radio"]:checked');
      const msg = form.querySelector('[data-ref="decide-msg"]');
      if (!picked) { if (msg) msg.textContent = 'Choose whether to keep or change the verdict first.'; return; }
      const agreed = picked.value === 'keep';
      const note = (form.querySelector('textarea') || {}).value || '';
      run.decisions[c.id] = { agreed, verdict: agreed ? c.verdict : otherVerdict(c.verdict), note: note.trim() };
      toast(`${c.name}: ${agreed ? 'kept as' : 'changed to'} ${agreed ? c.verdict : otherVerdict(c.verdict)}`, note.trim() ? 'Your note is saved with it.' : 'Counts updated.');
      if (form.dataset.mode === 'review') {
        S.reviewIdx += 1;
      }
      draw();
    }

    /* ---- events ---- */

    function onClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn || !root.contains(btn) || btn.disabled) return;
      const a = btn.dataset.action;
      switch (a) {
        case 'use-sample':
          loadFile(D.file.name, '');
          break;
        case 'clear-file':
          S.file = null; S.mapping = null; S.fileNote = '';
          draw();
          break;
        case 'step': {
          const to = btn.dataset.step;
          if (to === 'run' && S.run) { S.screen = 'run'; draw(); }
          else if (to === 'results' && S.run) openResults(S.run, S.view === 'detail' ? 'list' : S.view);
          else if (to === 'file' || (to === 'columns' && S.file) || (to === 'settings' && S.file && !mappingErrors(S.mapping).length)) {
            if (to === 'settings') lastEst = '';
            S.screen = to; draw();
          }
          break;
        }
        case 'key-help':
          S.keyHelp = !S.keyHelp; draw();
          break;
        case 'toggle-advanced':
          S.advancedOpen = !S.advancedOpen; draw();
          break;
        case 'reset-advanced':
          ['validatorThreshold', 'overrideMinConfidence', 'epoAdjustMax', 'lowEvidenceCap', 'maxWebSearches'].forEach((k) => { S.settings[k] = D.defaults[k]; });
          draw();
          break;
        case 'start-run':
          S.view = 'summary'; S.reviewIdx = 0;
          startRun(newRun());
          break;
        case 'stop-run':
          stopRun();
          break;
        case 'resume-run': {
          const run = S.runs.find((r) => r.id === btn.dataset.run);
          if (run && run.status === 'stopped') startRun(run);
          break;
        }
        case 'resume-past':
          resumePast(btn.dataset.id);
          break;
        case 'open-run': {
          const run = S.runs.find((r) => r.id === btn.dataset.run);
          if (run && run.results.length) openResults(run, 'summary');
          break;
        }
        case 'see-results':
          openResults(S.run, 'summary');
          break;
        case 'new-run':
          S.screen = 'file'; S.run = null; S.view = 'summary';
          draw();
          break;
        case 'view': {
          const v = btn.dataset.view;
          if (v === 'review') {
            const fl = flagged(S.run);
            const firstOpen = fl.findIndex((c) => !S.run.decisions[c.id]);
            S.reviewIdx = firstOpen === -1 ? 0 : firstOpen;
          }
          S.view = v;
          draw();
          break;
        }
        case 'review-at':
          S.view = 'review'; S.reviewIdx = Number(btn.dataset.i) || 0;
          draw();
          break;
        case 'review-prev':
          S.reviewIdx = Math.max(0, S.reviewIdx - 1); draw();
          break;
        case 'review-skip':
          S.reviewIdx += 1; draw();
          break;
        case 'open-company':
          S.detailBack = S.view === 'summary' ? 'summary' : 'list';
          S.view = 'detail'; S.detailId = btn.dataset.id;
          draw();
          break;
        case 'download': {
          const t = tally(S.run);
          download(S.run.fileName, S.run.status === 'stopped' ? `Includes the ${t.done} companies finished so far.` : '');
          break;
        }
        case 'download-past': {
          const p = S.past.find((r) => r.id === btn.dataset.id);
          if (p) download(p.file, '');
          break;
        }
        default: break;
      }
    }

    function onChange(e) {
      const el = e.target;
      if (el.matches('[data-ref="fileinput"]')) {
        const f = el.files && el.files[0];
        loadFile(D.file.name, f ? `Prototype: you chose ${f.name}; showing the sample file's contents instead.` : '');
        return;
      }
      if (el.matches('select[data-field]')) {
        S.mapping[el.dataset.field] = el.value || null;
        draw();
        return;
      }
      if (el.name === 'g-provider') {
        S.settings.provider = el.value; S.keyHelp = false; draw();
        return;
      }
      if (el.name === 'g-tier') { S.settings.tier = el.value; draw(); return; }
      if (el.matches('[data-toggle]')) { S.settings[el.dataset.toggle] = el.checked; draw(); return; }
      if (el.matches('.g-decide input[type="radio"]')) {
        const form = el.closest('form');
        form.querySelectorAll('.g-choice').forEach((l) => l.classList.toggle('is-selected', l.contains(el)));
        const msg = form.querySelector('[data-ref="decide-msg"]');
        if (msg) msg.textContent = '';
        return;
      }
      if (el.matches('[data-range]')) { draw(); }
    }

    function onInput(e) {
      const el = e.target;
      if (!el.matches('[data-range]')) return;
      const k = el.dataset.range;
      S.settings[k] = Number(el.value);
      const out = root.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = el.value + (el.dataset.unit || '');
      // Update the estimate in place so the slider keeps its drag.
      const est = estimate(S.settings, S.file.rows);
      const main = ref('est-main');
      const sub = ref('est-sub');
      if (main) {
        const next = `About <strong>${money(est.cost)}</strong> and ${duration(est.secs)}`;
        if (main.innerHTML !== next) { main.innerHTML = next; bump(main); lastEst = main.textContent; }
      }
      if (sub) sub.textContent = `Could be ${money(est.low)} to ${money(est.high)}, depending on how many web searches are needed.${est.batch ? ' Batch jobs occasionally take up to an hour.' : ''}`;
    }

    function onSubmit(e) {
      const form = e.target.closest('form[data-ref="decide"]');
      if (!form) return;
      e.preventDefault();
      saveDecision(form);
    }

    function onDragOver(e) {
      const zone = e.target.closest && e.target.closest('[data-ref="drop"]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.add('is-over');
    }
    function onDragLeave(e) {
      const zone = e.target.closest && e.target.closest('[data-ref="drop"]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
    }
    function onDrop(e) {
      const zone = e.target.closest && e.target.closest('[data-ref="drop"]');
      if (!zone) return;
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadFile(D.file.name, f ? `Prototype: you dropped ${f.name}; showing the sample file's contents instead.` : '');
    }
    // Stop a file dropped outside the zone from navigating the page away.
    function blockDocDrop(e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);
    document.addEventListener('dragover', blockDocDrop);
    document.addEventListener('drop', blockDocDrop);

    return function cleanup() {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      runTimer = null;
      if (S.run) S.run.status = S.run.status === 'running' ? 'stopped' : S.run.status;
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', blockDocDrop);
      document.removeEventListener('drop', blockDocDrop);
    };
  }

  window.PROTO_VARIANTS.guided = {
    css,
    render() { return shellHTML(freshState()); },
    init,
  };
})();
