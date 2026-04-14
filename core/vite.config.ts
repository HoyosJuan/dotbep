import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'jszip',
        'zod',
        /^node:/,
        /^fs/,
        /^path/,
        /^url/,
      ],
    },
    target: 'node18',
  },
  plugins: [dts({ rollupTypes: true })],
})
