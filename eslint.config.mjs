import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "src/appearance/tiles.generated.ts", "node_modules/**", "test/**", "scripts/**", "esbuild.config.mjs", "vitest.config.mts"] },
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: { projectService: { allowDefaultProject: ["eslint.config.mjs"] }, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["Pagewise", "Obsidian", "Lucide"], acronyms: ["US", "A4", "A5", "API"] }],
		},
	},
]);
