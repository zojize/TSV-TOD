import { defineConfig } from "vitest/config"
// @ts-ignore: shouldn't error
import Plugin from "./src/index.js"

export default defineConfig({
  plugins: [Plugin()],
  test: {
    include: ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    projects: [
      // root is included here to ensure the plugin is executed
      ".",
      // "sample-projects/*"
    ],
    exclude: [],
    globals: true,
    coverage: {
      provider: "v8"
    }
  }
})
