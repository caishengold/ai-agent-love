import nextConfig from "eslint-config-next";
import prettierConfig from "eslint-config-prettier";

const config = [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      "no-console": "warn",
    },
  },
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "coverage/",
      "standalone-server/",
      "scripts/",
      "docs/internal/",
      "sdk/js/dist/",
    ],
  },
];

export default config;
