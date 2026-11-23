// Lets node import the site's .tsx components, which its own type stripping does not compile: node --import ./tests/tsx.mjs
// The JSX is compiled as Vite compiles it, by oxc through rolldown, for Preact's automatic runtime.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'rolldown/utils';

registerHooks({
  load(url, context, nextLoad) {
    if (!new URL(url).pathname.endsWith('.tsx')) return nextLoad(url, context);
    const file = fileURLToPath(url);
    const { code, errors } = transformSync(file, readFileSync(file, 'utf8'), {
      jsx: { runtime: 'automatic', importSource: 'preact' },
      sourcemap: false,
    });
    if (errors.length) throw errors[0];
    return { format: 'module', source: code, shortCircuit: true };
  },
});
