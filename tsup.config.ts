import { defineConfig, type Options } from "tsup";

const isWatch = process.argv.includes("--watch");

const neutralConfig: Options = {
	entry: ["src/api/index.ts"],
	format: ["cjs", "esm"],
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: false,
	treeshake: true,
	minify: false,
	outDir: "dist/neutral",
	external: ["axios", "cheerio"],
	platform: "neutral",
};

const allConfigs: Options[] = [
	{
		entry: ["src/api/index.ts"],
		format: ["cjs", "esm"],
		dts: true,
		splitting: false,
		sourcemap: true,
		clean: true,
		treeshake: true,
		minify: false,
		outDir: "dist/node",
		external: ["axios", "cheerio"],
		platform: "node",
	},
	{
		entry: ["src/api/index.ts"],
		format: ["esm", "iife"],
		dts: false,
		splitting: false,
		sourcemap: true,
		clean: false,
		treeshake: true,
		minify: true,
		outDir: "dist/browser",
		external: ["axios", "cheerio"],
		platform: "browser",
		globalName: "CmruApi",
	},
	neutralConfig,
];

export default defineConfig(isWatch ? [neutralConfig] : allConfigs);
