import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// Lint the app source only. TypeScript is checked separately via `tsc --noEmit`
// (npm run typecheck), so we use the lighter core-web-vitals preset here and skip
// the noisy next/typescript rules to keep `npm run lint` a fast, CI-friendly gate.
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "build/**",
      // CommonJS config files legitimately use require(); don't lint them as ESM TS.
      "*.cjs",
      "tailwind.config.cjs",
      "postcss.config.cjs",
      "next.config.mjs",
      "prisma/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Favicons render via plain <img> (external / data-URI); next/image isn't used.
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;