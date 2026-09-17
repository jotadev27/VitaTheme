import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Import patterns used to enforce the Clean Architecture dependency rule.
 * Both alias (`@/layer/...`) and relative (`../layer/...`) forms are covered so the
 * boundary cannot be bypassed by choosing a different import style.
 */
const layerPatterns = (layer) => [`@/${layer}/**`, `**/${layer}/**`, `${layer}/**`];

const forbid = (layers, message, extraPatterns = []) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [{ group: layers.flatMap(layerPatterns), message }, ...extraPatterns],
    },
  ],
});

export default tseslint.config(
  { ignores: ['dist/**', 'out/**', 'release/**', 'coverage/**', 'node_modules/**'] },

  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },

  {
    // The domain layer is the innermost circle: no outer layer, no I/O, no runtime dependency.
    files: ['src/domain/**/*.ts'],
    rules: {
      ...forbid(
        ['application', 'infrastructure', 'presentation', 'ipc', 'main', 'preload'],
        'The domain layer must not depend on any outer layer.',
      ),
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'The domain layer must stay free of runtime/platform access.' },
      ],
    },
  },

  {
    // The application layer orchestrates the domain through ports; adapters stay outside.
    files: ['src/application/**/*.ts'],
    rules: forbid(
      ['infrastructure', 'presentation', 'ipc', 'main', 'preload'],
      'The application layer must depend on ports, never on a concrete adapter or a delivery mechanism.',
    ),
  },

  {
    // Adapters may implement application ports, but must never reach into the UI.
    files: ['src/infrastructure/**/*.ts'],
    rules: forbid(
      ['presentation', 'main', 'preload'],
      'Infrastructure must not depend on the presentation layer or on Electron.',
      [{ group: ['electron'], message: 'Infrastructure must stay independent of Electron.' }],
    ),
  },

  {
    // The wire contract is declarations shared by three processes: types, and nothing else.
    files: ['src/ipc/**/*.ts'],
    rules: forbid(
      ['infrastructure', 'presentation', 'main', 'preload'],
      'The IPC contract may describe the domain, but must not depend on a process or an adapter.',
      [
        {
          group: ['electron'],
          message: 'The IPC contract is shared with the window, which has no Electron.',
        },
      ],
    ),
  },

  {
    // The bridge carries messages. It must not know what is at either end of them.
    files: ['src/preload/**/*.ts'],
    rules: forbid(
      ['domain', 'application', 'infrastructure', 'presentation', 'main'],
      'The preload bridge may use the IPC contract and nothing else: it runs sandboxed next to untrusted content.',
    ),
  },

  {
    // The privileged process wires the application together; it renders nothing.
    files: ['src/main/**/*.ts'],
    rules: forbid(['presentation'], 'The main process must not depend on the interface it hosts.'),
  },

  {
    // The window is a browser. No Node, no Electron, no adapters, and no way to reach them.
    files: ['src/presentation/**/*.ts', 'src/presentation/**/*.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      // Advisory in the shipped preset; here a missing dependency is a bug like any other.
      'react-hooks/exhaustive-deps': 'error',
      ...forbid(
        ['application', 'infrastructure', 'main', 'preload'],
        'The window reaches the application through the IPC bridge, never directly.',
        [
          { group: ['electron'], message: 'The window has no access to Electron.' },
          {
            group: ['node:*', 'fs', 'path', 'os', 'child_process'],
            message: 'The window has no access to Node.',
          },
        ],
      ),
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'The window runs with no Node integration.' },
        { name: 'require', message: 'The window runs with no module loader.' },
        { name: '__dirname', message: 'The window runs with no Node integration.' },
      ],
    },
  },

  {
    files: ['tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['eslint.config.js', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    // Named one by one rather than pulled from a globals package: these scripts are small and
    // the list says exactly how much of the platform they are allowed to reach for.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      // These are command-line tools: saying what they found is the whole point of them.
      'no-console': 'off',
    },
  },
);
