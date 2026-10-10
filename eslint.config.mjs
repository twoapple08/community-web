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
    // 앱 껍데기(안드로이드/윈도우)와 Supabase Edge Function 은 각자 도구로 검사 (사이트 빌드와 분리)
    "apps/**",
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
