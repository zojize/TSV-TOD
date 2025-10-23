import * as Args from "@effect/cli/Args"
import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"
import * as os from "node:os"
import { RunProject } from "./RunProject.js"
import { WorkingDirectory } from "./WorkingDirectory.js"

const debug = Options.boolean("debug").pipe(
  Options.withDescription("Enable debug logging"),
  Options.withDefault(false)
)

const project = Args.directory({ exists: "yes" }).pipe(
  Args.withDefault("."),
  Args.withDescription("Path to the TypeScript + Vitest project to analyze")
)

const command = Command.make(
  "tsv-tod",
  { project, debug },
  ({ debug, project }) =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      const cwd = path.resolve(project)
      const concurrency = os.availableParallelism()
      yield* Effect.logInfo(`Analyzing project at: ${cwd} with concurrency: ${concurrency}`)

      return yield* RunProject.pipe(
        Effect.provideService(WorkingDirectory, cwd),
        Effect.withConcurrency(concurrency),
        Logger.withMinimumLogLevel(debug ? LogLevel.Debug : LogLevel.Info),
        Effect.withLogSpan("tsv-tod")
      )
    })
)

export const run = Command.run(command, {
  name: "TypeScript Vitest Test Order-dependency Detector",
  version: "0.0.0"
})
