import { defineConfig, mergeConfig } from "vitest/config"
import type { TestSpecification } from "vitest/node"
import { BaseSequencer } from "vitest/node"
// @ts-expect-error
import viteConfig from "{{configPath}}"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      sequence: {
        sequencer: class CustomSequencer extends BaseSequencer {
          public override async sort(files: Array<TestSpecification>) {
            const runnerPath = process.env["TSV_TOD_RUNNER_PATH"]
            if (!runnerPath) {
              throw new Error("TSV_TOD_RUNNER_PATH is not set")
            }

            // there should be exactly one file per run
            // for some reason just specifying the runner in vitest.config.ts doesn't work
            files[0].project.config.runner = runnerPath
            return [files[0]]
          }
        }
      }
    }
  })
)
