import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier";
import unicorn from "eslint-plugin-unicorn";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	{
		ignores: ["dist/**", "node_modules/**", "public/**"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			prettier: prettier,
			unicorn: unicorn,
		},
		rules: {
			"prettier/prettier": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
			"unicorn/prevent-abbreviations": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/prefer-top-level-await": "off",
			"unicorn/no-null": "off",
			"unicorn/no-process-exit": "off",
			"unicorn/prefer-module": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/prefer-array-some": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/no-useless-undefined": "off",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-await-expression-member": "off",
		},
	},
];

export default config;
