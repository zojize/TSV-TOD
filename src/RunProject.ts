import * as Command from "@effect/platform/Command"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Terminal from "@effect/platform/Terminal"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import * as Schema from "effect/Schema"
import { make as CommandMake } from "./Command.js"
import { RunTestFile, VitestFile } from "./RunTestFile.js"
import { WorkingDirectory } from "./WorkingDirectory.js"

const VitestFilesList = Schema.parseJson(Schema.NonEmptyArrayEnsure(VitestFile))
type VitestFilesList = Schema.Schema.Type<typeof VitestFilesList>

export const RunProject = Effect.gen(function*() {
  const path = yield* Path.Path
  const { display } = yield* Terminal.Terminal
  const cwd = yield* WorkingDirectory
  const fs = yield* FileSystem.FileSystem

  const nodeModulesExists = yield* fs.exists(path.join(cwd, "node_modules"))

  if (!nodeModulesExists) {
    yield* Effect.logInfo(`Installing dependencies in project at: ${cwd}`)
    const isNpm = yield* fs.exists(path.join(cwd, "package-lock.json"))
    const isYarn = yield* fs.exists(path.join(cwd, "yarn.lock"))
    const isPnpm = yield* fs.exists(path.join(cwd, "pnpm-lock.yaml"))

    const installCmd = isNpm
      ? yield* CommandMake("npm", "install")
      : isYarn
      ? yield* CommandMake("yarn", "install")
      : isPnpm
      ? yield* CommandMake("pnpm", "install")
      : yield* CommandMake("npm", "install") // Default to npm if no lock file found

    const installExitCode = yield* Effect.either(Command.exitCode(installCmd.pipe(Command.workingDirectory(cwd))))
    if (Either.isLeft(installExitCode) || installExitCode.right !== 0) {
      return yield* Effect.logError(`Failed to install dependencies at: ${cwd}`)
    }
  }

  const vitestListCmd = yield* CommandMake("npx", "vitest", "list", "--filesOnly", "--json")

  const rawVitestListOutput = yield* Command.string(vitestListCmd)
  yield* Effect.logDebug(`vitest list output: ${rawVitestListOutput}`)

  const vitestFiles = yield* Schema.decode(VitestFilesList)(rawVitestListOutput)
  yield* Effect.logInfo(`Found ${vitestFiles.length} test files in project`)

  const runTestFile = (file: string, shuffle: boolean) =>
    Effect.gen(function*() {
      const relPath = path.relative(cwd, file)
      yield* Effect.logDebug(`Running ${relPath}${shuffle ? " with shuffle" : ""}`)
      const result = yield* RunTestFile({ file, shuffle })
      yield* Effect.logDebug(`${result.success ? "[PASS]" : "[FAIL]"} ${relPath}`)
      return result
    })

  const runResults = yield* Effect.all(
    vitestFiles.map(
      ({ file }) => runTestFile(file, false)
    ),
    { concurrency: "inherit" }
  )

  const runResultsWithShuffle = yield* Effect.loop(1, {
    step: (i) => i + 1,
    while: (i) => i <= 5,
    body: (i) =>
      Effect.logInfo(`Starting shuffled run ${i} for files: ${vitestFiles.map(({ file }) => file).join(", ")}`).pipe(
        Effect.andThen(Effect.all(
          vitestFiles.map(
            ({ file }) => runTestFile(file, true)
          ),
          { concurrency: "inherit" }
        ))
      )
  })

  const flakyResults = runResultsWithShuffle[0].flatMap((_, i) => {
    const ithRunResult = runResults[i]
    const ithResults = runResultsWithShuffle.map((results) => results[i])
    const hasFlaked = Array.some(ithResults, (r) => r.success !== ithRunResult.success)
    return hasFlaked ? [[ithRunResult, ...ithResults]] : []
  })

  if (flakyResults.length === 0) {
    yield* Effect.logInfo("No flaky tests detected.")
  } else {
    yield* display(JSON.stringify(flakyResults, null, 2))
  }
})
