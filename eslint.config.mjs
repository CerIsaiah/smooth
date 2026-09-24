import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // Never lint build output, vendored, or generated files.
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
      // Generated Tailwind config trips import/no-anonymous-default-export.
      "tailwind.config.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // The blog/privacy pages quote copy freely with bare quotes. React
      // escapes text nodes on render, so they are not a correctness or XSS
      // concern; suppressing instead of rewriting 40+ lines of page copy in
      // this cleanup PR.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
