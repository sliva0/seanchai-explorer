// What a page says where something fails, and that the failure is logged: a document the data does not hold, a data
// file missing, sent as a web page, not JSON, of another schema or another shape, a page failing as it is drawn, and an
// error nothing caught.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DataError, describeFailure } from '../../src/errors.ts';
import { SCHEMA_VERSION } from '../../src/types.ts';
import { boot, click, settle } from './helpers.mjs';

/** Boots a page with `options`, keeping what goes to console.error, each the logged value itself. */
async function bootLogged(options) {
  const errors = [];
  const original = console.error;
  // Node's own warnings are written there too, as text.
  console.error = (...values) =>
    errors.push(...values.filter(value => typeof value !== 'string' || !/Warning|--trace-warnings/.test(value)));
  try {
    const page = await boot(options);
    return {
      page,
      errors,
      async close() {
        console.error = original;
        await page.close();
      },
    };
  } catch (error) {
    console.error = original;
    throw error;
  }
}

/** The failure page's parts, as a reader sees them. */
function failureOf(document) {
  const panel = document.querySelector('main .failure');
  assert.ok(panel, `a failure is shown, not: ${document.querySelector('main')?.textContent.slice(0, 200)}`);
  const text = selector => panel.querySelector(selector)?.textContent ?? null;
  return {
    heading: text('h1'),
    summary: text('.failure-summary'),
    hint: text('.failure-hint'),
    message: text('.failure-message code'),
    stack: text('.failure-details pre'),
    folded: !panel.querySelector('.failure-details').open,
    back: panel.querySelector('.failure-actions a')?.getAttribute('href'),
    reload: [...panel.querySelectorAll('.failure-actions button')].map(button => button.textContent),
  };
}

const response = (status, statusText, body = '', type = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: new Map([['content-type', type]]),
  json: async () => JSON.parse(body),
});

test('each failure the site can explain has words of its own, saying the file, the status and both schemas', () => {
  const said = problem => describeFailure(new DataError(problem, 'x'));
  assert.deepEqual(
    said({ kind: 'no-document', id: '29272-x' }).summary,
    `This build's data has no document "29272-x".`,
  );
  const missing = said({ kind: 'missing', file: 'data/documents/a.json', status: '404 Not Found', page: false });
  assert.equal(missing.heading, 'Data file missing');
  assert.equal(missing.summary, "data/documents/a.json is not in this build's data (HTTP 404 Not Found).");
  const page = said({ kind: 'missing', file: 'data/documents/a.json', status: '200', page: true });
  assert.match(page.summary, /the server sent a web page in its place, as vite preview does/);
  assert.equal(
    said({ kind: 'http', file: 'data/index.json', status: '500' }).summary,
    'The server could not send data/index.json (HTTP 500).',
  );
  const schema = said({ kind: 'schema', file: 'data/index.json', found: '4', reads: 3 });
  assert.equal(schema.heading, 'Data of another export schema');
  assert.equal(schema.summary, 'data/index.json was written by export schema 4, and this build reads schema 3.');
  assert.equal(said({ kind: 'not-json', file: 'data/search.json' }).heading, 'Broken data file');
  const shape = describeFailure(new DataError({ kind: 'shape', file: 'data/tables.json', reads: 3 }, 'x'), {
    seanchai: '0.2.0',
  });
  assert.equal(
    shape.summary,
    'data/tables.json is of export schema 3, which this build reads, but not in the shape it reads.',
  );
  assert.match(shape.hint, /newer seanchai than this build was made for \(seanchai 0\.2\.0\)/);
  const drawn = describeFailure(new TypeError("Cannot read properties of undefined (reading 'title')"), {
    document: 'TS 29.272 V19.6.0',
    seanchai: '0.2.0',
  });
  assert.equal(drawn.heading, 'Could not show TS 29.272 V19.6.0');
  assert.equal(drawn.message, "TypeError: Cannot read properties of undefined (reading 'title')");
  assert.match(drawn.stack, /^TypeError: Cannot read properties/);
  for (const text of [missing, page, schema, shape, drawn].flatMap(failure => [failure.summary, failure.hint ?? '']))
    assert.doesNotMatch(text, /github|pypi|self-hosted/i, 'an unlinked build says it too');
});

test('a document the data does not hold says so, with the way back, and is logged', async () => {
  const { page, errors, close } = await bootLogged({ hash: '#29272-x99' });
  try {
    const failure = failureOf(page.document);
    assert.equal(failure.heading, 'Document not found');
    assert.equal(page.document.title, 'Document not found — Seanchaí');
    assert.equal(failure.summary, `This build's data has no document "29272-x99".`);
    assert.equal(failure.back, '#');
    assert.deepEqual(failure.reload, ['Reload']);
    assert.ok(failure.folded, 'the stack is folded');
    assert.equal(errors.length, 1, errors.map(String).join('\n'));
    assert.ok(errors[0] instanceof Error, 'the error object itself, for its stack');
  } finally {
    await close();
  }
});

test("a document's data file missing, or sent as a web page, says which file and the status", async () => {
  const missing = await bootLogged({
    hash: '#29153-j00',
    serve: path => (path === 'data/documents/29153-j00.json' ? response(404, 'Not Found') : undefined),
  });
  try {
    const failure = failureOf(missing.page.document);
    assert.equal(failure.heading, 'Data file missing');
    assert.equal(failure.summary, "data/documents/29153-j00.json is not in this build's data (HTTP 404 Not Found).");
    assert.match(failure.hint, /Building the site again/);
    assert.equal(missing.errors.length, 1);
  } finally {
    await missing.close();
  }
  const served = await bootLogged({
    hash: '#29153-j00',
    serve: path =>
      path === 'data/documents/29153-j00.json' ? response(200, 'OK', '<!doctype html>', 'text/html') : undefined,
  });
  try {
    assert.match(
      failureOf(served.page.document).summary,
      /^data\/documents\/29153-j00\.json is not in this build's data: the server sent a web page/,
    );
    assert.equal(served.errors.length, 1);
  } finally {
    await served.close();
  }
});

test('data of another export schema says both numbers, and data of the right one misshapen says so', async () => {
  const other = await bootLogged({
    transform: (path, data) => (path === 'data/index.json' ? { ...data, schema_version: SCHEMA_VERSION + 1 } : data),
  });
  try {
    const failure = failureOf(other.page.document);
    assert.equal(failure.heading, 'Data of another export schema');
    assert.equal(
      failure.summary,
      `data/index.json was written by export schema ${SCHEMA_VERSION + 1}, and this build reads schema ${SCHEMA_VERSION}.`,
    );
    assert.equal(other.errors.length, 1);
  } finally {
    await other.close();
  }
  const misshapen = await bootLogged({
    hash: '#29153-j00',
    transform: (path, data) => (path === 'data/documents/29153-j00.json' ? { ...data, lines: undefined } : data),
  });
  try {
    const failure = failureOf(misshapen.page.document);
    assert.equal(failure.heading, 'Unexpected data');
    assert.match(failure.message, /data\/documents\/29153-j00\.json has no lines list/);
    assert.match(failure.hint, /seanchai 0\.2\.0/);
  } finally {
    await misshapen.close();
  }
});

test('a document failing as it is drawn says which, with the exception and its stack, each logged once', async () => {
  const { page, errors, close } = await bootLogged({
    hash: '#29153-j00',
    // Of the shape the site checks, but with a section it cannot read: the section list fails as it is drawn.
    transform: (path, data) =>
      path === 'data/documents/29153-j00.json' ? { ...data, sections: [null, ...data.sections] } : data,
  });
  try {
    const failure = failureOf(page.document);
    assert.match(failure.heading, /^Could not show TS 29\.153/);
    assert.match(failure.summary, /failed as it was drawn\.$/);
    assert.match(failure.message, /^TypeError: /);
    assert.match(failure.stack, /TypeError: /);
    assert.match(page.document.title, /^Could not show TS 29\.153/);
    // The section list and the text drawn beside it each fail on the section: each is logged, and once only.
    assert.ok(errors.length >= 1);
    assert.equal(
      new Set(errors).size,
      errors.length,
      'no error logged twice, though the boundary and the router both see it',
    );
    assert.equal(String(errors[0]), failure.message, 'the one shown is logged');
    assert.ok(errors.every(error => error instanceof TypeError));
    // The page works on: another route draws its page.
    await page.go('#29109-j00');
    assert.ok(page.document.querySelector('#document'), 'the next document is drawn');
    assert.equal(page.document.querySelector('main .failure'), null);
  } finally {
    await close();
  }
});

test("a page of the site's own failing as it is drawn shows the failure in its place, the header kept", async () => {
  const { page, errors, close } = await bootLogged({
    transform: (path, data) =>
      path === 'data/index.json' ? { ...data, documents: data.documents.map(doc => ({ ...doc, title: null })) } : data,
  });
  try {
    const failure = failureOf(page.document);
    assert.equal(failure.heading, 'Something went wrong');
    assert.equal(failure.summary, 'The Index page failed as it was drawn.');
    assert.ok(page.document.querySelector('header nav'), 'the header is drawn');
    assert.ok(errors.length >= 1);
  } finally {
    await close();
  }
});

test('search data that fails says so in the results, and is logged', async () => {
  const { page, errors, close } = await bootLogged({
    hash: '#search?q=Session-Id',
    serve: path => (path === 'data/search.json' ? response(404, 'Not Found') : undefined),
  });
  try {
    await settle();
    const panel = page.document.querySelector('#search-results .failure-inline');
    assert.ok(panel, 'a failure among the results');
    assert.match(panel.textContent, /data\/search\.json is not in this build's data \(HTTP 404 Not Found\)/);
    assert.equal(errors.length, 1);
  } finally {
    await close();
  }
});

test('an index the pages go on without, failing, is a notice and logged, and the document is shown', async () => {
  const { page, errors, close } = await bootLogged({
    hash: '#29153-j00',
    serve: path => (path === 'data/tables.json' ? response(200, 'OK', '<html>', 'text/html') : undefined),
  });
  try {
    assert.ok(page.document.querySelector('#document'), 'the document is shown');
    const notice = page.document.querySelector('#notices .notice');
    assert.match(notice.textContent, /^Could not load data\/tables\.json; the pages go on without it\./);
    assert.equal(errors.length, 1);
  } finally {
    await close();
  }
});

test('an error nothing caught is a notice over the page, logged as the error itself', async () => {
  const { page, errors, close } = await bootLogged({ hash: '#29153-j00' });
  try {
    const reason = new Error('lost');
    const event = new page.window.Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(event, 'reason', { value: reason });
    page.window.dispatchEvent(event);
    assert.ok(event.defaultPrevented, 'not logged again by the browser');
    const notice = page.document.querySelector('#notices .notice');
    assert.match(notice.textContent, /^Something went wrong\. Error: lost/);
    assert.deepEqual(errors, [reason]);
    assert.ok(page.document.querySelector('#document'), 'the page stays');
    click(page, notice.querySelector('.notice-dismiss'));
  } finally {
    await close();
  }
});
