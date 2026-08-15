import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const eppCheckPath = fileURLToPath(new URL('../src/adapters/eppCheck.ts', import.meta.url));
const eppCheckBrowserPath = fileURLToPath(new URL('../src/adapters/eppCheck.browser.ts', import.meta.url));

// CLI `esbuild --alias:` only rewrites bare package specifiers, not relative
// imports, so the browser build needs a resolver plugin to swap
// eppCheck.ts -> eppCheck.browser.ts and keep `epp-client` out of the
// bundled source text entirely (see domainstat-browser-build-plan.md).
const swapEppCheckPlugin = {
  name: 'swap-eppcheck-browser',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\/eppCheck$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path) + '.ts';
      if (resolved === eppCheckPath) {
        return { path: eppCheckBrowserPath };
      }
      return null;
    });
  },
};

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'dist/index.browser.js',
  platform: 'browser',
  external: ['epp-client'],
  plugins: [swapEppCheckPlugin],
});
