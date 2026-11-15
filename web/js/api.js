/* The HTTP API (webapp/app.py), one function per route. Each resolves with
   the parsed JSON and rejects with Error(detail) on a non-2xx response, using
   the server's {"detail": "..."} text and carrying the HTTP status as
   error.status, or with a readable message (and no status) when the server
   cannot be reached. */

async function call(method, url, body) {
  const opts = { method, headers: { Accept: 'application/json' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error('Could not reach the server.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw Object.assign(new Error(detailText(data, res.status)), { status: res.status });
  return data;
}

/* The server's detail: a string for our own errors, a list of {msg} for
   FastAPI's request validation errors. data is the parsed body, or null when
   it was not JSON; the fallback names the status. */
export function detailText(data, status) {
  const d = data && data.detail;
  if (typeof d === 'string' && d) return d;
  if (Array.isArray(d) && d.length) return d.map((x) => (x && x.msg) || String(x)).join(' ');
  return 'The server answered with an error (' + status + ').';
}

const run = (id) => '/api/runs/' + encodeURIComponent(id);
const row = (id, index) => run(id) + '/rows/' + encodeURIComponent(index);

export const getSetup = () => call('GET', '/api/setup');
export function uploadFile(file) {
  const form = new FormData();
  form.append('file', file, file.name);
  return call('POST', '/api/files', form);
}
export const postEstimate = (settings, rows) => call('POST', '/api/estimate', { settings, rows });
export const listRuns = () => call('GET', '/api/runs');
export const createRun = (fileId, settings, exclude) => call('POST', '/api/runs', { fileId, settings, exclude });
export const getRun = (id) => call('GET', run(id));
export const getChanges = (id, cursor) => call('GET', run(id) + '/changes?cursor=' + encodeURIComponent(cursor));
export const stopRun = (id) => call('POST', run(id) + '/stop');
export const resumeRun = (id) => call('POST', run(id) + '/resume');
export const putDecision = (id, index, choice, note) => call('PUT', row(id, index) + '/decision', { choice, note });
export const restoreDecision = (id, index) => call('POST', row(id, index) + '/restore');
export const undoDecision = (id, index) => call('POST', row(id, index) + '/undo');
export const exportUrl = (id) => run(id) + '/export.xlsx';
