// What every unit test process loads first: node --import ./tests/setup.mjs
// It compiles the site's .tsx modules (tests/tsx.mjs), and keeps a failed comparison over a DOM node from printing it.
// An AssertionError prints its operands to a depth of 1000 with every getter called, even beside a message of its own,
// and a happy-dom node reaches its whole document and window that way: one failing assert.deepEqual over a list of
// nodes grew a test process past 20 GB, most of it outside the V8 heap that --max-old-space-size caps. Here a strict
// comparison over a node is made as node:assert/strict makes it, and fails with the operands printed short, each node
// by its tag, id and class, as node's printing names one too.
import assert from 'node:assert/strict';
import { syncBuiltinESMExports } from 'node:module';
import { inspect, isDeepStrictEqual } from 'node:util';
import { Node } from 'happy-dom';
import './tsx.mjs';

// The build options vite.config.ts defines (src/build-options.d.ts), as a build without any of them has them.
globalThis.SEANCHAI_UNLINKED ??= false;

/** A node as `<a#id.class>`, or its node name if it is not an element. */
export const nodeName = node =>
  node?.nodeType === 1
    ? `<${node.localName}${node.id ? `#${node.id}` : ''}${node.getAttribute('class') ? `.${node.getAttribute('class').trim().split(/\s+/).join('.')}` : ''}>`
    : node?.nodeType
      ? node.nodeName
      : String(node);

Object.defineProperty(Node.prototype, inspect.custom, {
  configurable: true,
  value() {
    return nodeName(this);
  },
});

/** `value` is a node, or an array or plain object holding one a few levels down. */
function holdsNode(value, depth = 0) {
  if (value instanceof Node) return true;
  if (depth > 3 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => holdsNode(item, depth + 1));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).some(item => holdsNode(item, depth + 1));
}

/** Each strict comparison, by what passes it. node:assert/strict's equal is strictEqual, its deepEqual deepStrictEqual. */
const passes = {
  equal: Object.is,
  strictEqual: Object.is,
  notEqual: (actual, expected) => !Object.is(actual, expected),
  notStrictEqual: (actual, expected) => !Object.is(actual, expected),
  deepEqual: isDeepStrictEqual,
  deepStrictEqual: isDeepStrictEqual,
  notDeepEqual: (actual, expected) => !isDeepStrictEqual(actual, expected),
  notDeepStrictEqual: (actual, expected) => !isDeepStrictEqual(actual, expected),
};
for (const [name, pass] of Object.entries(passes)) {
  const compare = assert[name];
  // The message is passed on only where given: node takes an undefined one for a message of the wrong type.
  assert[name] = function checked(actual, expected, ...rest) {
    if (!holdsNode(actual) && !holdsNode(expected)) return compare.call(this, actual, expected, ...rest);
    const [message] = rest;
    if (pass(actual, expected)) return;
    if (message instanceof Error) throw message;
    throw new assert.AssertionError({
      message: `${message === undefined ? '' : `${message}\n`}${name} failed over ${inspect(actual)} and ${inspect(expected)}`,
      actual: inspect(actual),
      expected: inspect(expected),
      operator: 'fail',
      stackStartFn: checked,
    });
  };
}
syncBuiltinESMExports();
