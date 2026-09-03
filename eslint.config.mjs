import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // The ISE cheat sheet passes its content to the sheet-kit
  // primitives as data — arrays of table rows, label/value tuples
  // and bullet items. Those arrays hold JSX, but they are never
  // rendered directly: Table, KV, Bullets and Steps map over them
  // and apply the keys themselves. jsx-key only sees an array
  // literal containing elements and reports every cell, which
  // would be several hundred false positives.
  {
    files: ["components/ise/topics/**/*.tsx"],
    rules: { "react/jsx-key": "off" },
  },
]);

export default eslintConfig;
