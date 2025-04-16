import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ElectronSSR',
      fileName: (format) => format === 'cjs' ? 'index.js' : `index.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['electron', 'stream'],
      output: {
        exports: "named",
        globals: {
          electron: 'electron',
          stream: 'stream',
        },
      },
    },
    sourcemap: true,
    outDir: 'dist',
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      outDir: 'dist',
    }),
  ],
}); 