import * as Args from "@effect/cli/Args"
import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as Path from "@effect/platform/Path"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"
import * as Option from "effect/Option"
import * as os from "node:os"
import { GenId, genId } from "./GenId.js"
import { RunProject } from "./RunProject.js"

const debug = Options.boolean("debug").pipe(
  Options.withDefault(false),
  Options.withDescription("Enable debug logging")
)

const order = Options.choice(
  "order",
  [
    "original",
    "random-group",
    "random-test",
    "reverse-group",
    "reverse-test"
  ]
).pipe(
  Options.withDefault("original"),
  Options.withDescription("Test execution order to use when running tests")
)

const rounds = Options.integer("rounds").pipe(
  Options.withDefault(20),
  Options.withDescription("Number of rounds to run the full test suite")
)

const out = Options.file("out", { exists: "either" }).pipe(
  Options.optional,
  Options.withDescription("File to write the JSON report to")
)

const project = Args.directory({ exists: "yes" }).pipe(
  Args.withDefault("."),
  Args.withDescription("Path to the TypeScript + Vitest project to analyze")
)

const command = Command.make(
  "tsv-tod",
  { project, debug, order, rounds, out },
  ({ debug, order, out, project, rounds }) =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      const cwd = path.resolve(project)
      const concurrency = os.availableParallelism()
      yield* Effect.logInfo(`Analyzing project at: ${cwd} with concurrency: ${concurrency}`)

      return yield* RunProject.pipe(
        Effect.withConfigProvider(ConfigProvider.fromJson({
          PROJECT_DIRECTORY: cwd,
          ORDER: order,
          ROUNDS: rounds,
          ...Option.isSome(out) ? { OUT_FILE: Option.getOrThrow(out) } : {}
        })),
        Effect.provideService(GenId, genId),
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
