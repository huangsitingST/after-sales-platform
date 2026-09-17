import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const root = fileURLToPath(
	new URL('./src/frontend/mcp-app', import.meta.url)
)

export default defineConfig({
	root,
	plugins: [vue(), viteSingleFile()],
	build: {
		outDir: resolve(root, '../../../dist/mcp-app'),
		emptyOutDir: true
	}
})
