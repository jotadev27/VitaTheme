import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const source = fileURLToPath(new URL('./src', import.meta.url));
const renderer = fileURLToPath(new URL('./src/presentation', import.meta.url));

const alias = { '@': source };

/**
 * The window's content security policy.
 *
 * The built application loads its own files and talks to nothing, so everything is refused
 * except what it serves itself. Inline styles are allowed because the development server
 * injects stylesheets that way, and connections to the development server are allowed only
 * while running against it — the shipped page can open no socket at all.
 */
const contentSecurityPolicy = (development: boolean): string =>
  [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data:",
    "font-src 'self'",
    development ? "connect-src 'self' ws: http://localhost:*" : "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ');

const contentSecurityPolicyPlugin = (): Plugin => ({
  name: 'vitatheme-content-security-policy',
  transformIndexHtml: {
    order: 'pre',
    handler: (html, context) =>
      html.replace(
        '<!--content-security-policy-->',
        `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(
          context.server !== undefined,
        )}" />`,
      ),
  },
});

/**
 * What stays outside the bundle.
 *
 * Only Electron itself and Node's own modules, which the runtime provides — including the
 * ones a dependency asks for by their old bare names, such as `fs` rather than `node:fs`.
 * Everything else is bundled in, so the packaged application is its own code and nothing
 * else: no `node_modules` to ship, and nothing for a package manager's layout to get wrong.
 */
const providedByTheRuntime = (id: string): boolean =>
  id === 'electron' || id.startsWith('node:') || builtinModules.includes(id);

export default defineConfig({
  main: {
    resolve: {
      alias,
      /**
       * Which entry point a dependency offers this build.
       *
       * The Electron preset asks for `node` and nothing else, and a package that publishes
       * only `import` and `require` — which is most of them now — then resolves to nothing
       * at all. Rollup quietly leaves it as a bare import instead, which would be a package
       * reaching for a `node_modules` this application does not ship. Asking for `import`
       * as well is what keeps everything bundled.
       */
      conditions: ['node', 'import'],
    },
    build: {
      /**
       * Bundle the dependencies rather than leaving them as bare imports.
       *
       * electron-vite externalises everything in `dependencies` by default, which works
       * only for an application that ships its `node_modules` beside itself. This one
       * ships a bundle and nothing else, so the default has to be turned off — silently,
       * it would produce a package that imports libraries that are not there.
       */
      externalizeDeps: false,
      rollupOptions: {
        external: providedByTheRuntime,
        // Two entries, because converting a picture is a second of unbroken arithmetic and
        // the process that owns the windows should not be the one doing it. The worker is
        // built beside the process that starts it and loaded by path, the same way the
        // preload already is.
        input: {
          index: fileURLToPath(new URL('./src/main/index.ts', import.meta.url)),
          'image-worker': fileURLToPath(
            new URL('./src/infrastructure/image/image-worker.ts', import.meta.url),
          ),
        },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        external: providedByTheRuntime,
        // The preload runs in a sandbox, which has no module loader: it has to be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: renderer,
    resolve: { alias },
    plugins: [react(), contentSecurityPolicyPlugin()],
    build: {
      rollupOptions: { input: { index: `${renderer}/index.html` } },
    },
  },
});
