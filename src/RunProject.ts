import * as Command from "@effect/platform/Command"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Terminal from "@effect/platform/Terminal"
import * as Array from "effect/Array"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { make as CommandMake } from "./Command.js"
import { RunTestFile } from "./RunTestFile.js"
import type { RoundReport } from "./Types.js"
import { TestOrder, VitestFilesList } from "./Types.js"

export const RunProject = Effect.gen(function*() {
  const cwd = yield* Config.string("PROJECT_DIRECTORY")
  const rounds = yield* Config.number("ROUNDS")
  const out = yield* Config.string("OUT_FILE").pipe(Config.option)
  const seed = yield* Config.integer("SEED").pipe(Config.withDefault(Date.now()))
  const order = yield* Schema.decodeUnknown(TestOrder)(yield* Config.string("ORDER"))
  const path = yield* Path.Path
  const { display } = yield* Terminal.Terminal
  const fs = yield* FileSystem.FileSystem

  const nodeModulesExists = yield* fs.exists(path.join(cwd, "node_modules"))

  if (!nodeModulesExists) {
    yield* Effect.logInfo(`Installing dependencies in project at: ${cwd}`)
    const isNpm = yield* fs.exists(path.join(cwd, "package-lock.json"))
    const isYarn = yield* fs.exists(path.join(cwd, "yarn.lock"))
    const isPnpm = yield* fs.exists(path.join(cwd, "pnpm-lock.yaml"))

    const installCmd = isNpm
      ? yield* CommandMake({ cmd: "npm", args: ["install"] })
      : isYarn
      ? yield* CommandMake({ cmd: "yarn", args: ["install"] })
      : isPnpm
      ? yield* CommandMake({ cmd: "pnpm", args: ["install"] })
      : yield* CommandMake({ cmd: "npm", args: ["install"] }) // Default to npm if no lock file found

    const installExitCode = yield* Effect.either(Command.exitCode(installCmd.pipe(Command.workingDirectory(cwd))))
    if (Either.isLeft(installExitCode) || installExitCode.right !== 0) {
      return yield* Effect.logError(`Failed to install dependencies at: ${cwd}`)
    }
  }

  const vitestListCmd = yield* CommandMake({
    cmd: "npx",
    args: ["vitest", "list", "--filesOnly", "--json"]
  })
  let rawVitestListOutput = yield* Command.string(vitestListCmd)

  // Clean up any leading lines before the JSON array
  const lines = rawVitestListOutput.split("\n")
  while (lines[0].trim() !== "[") {
    lines.shift()
  }
  rawVitestListOutput = lines.join("\n")

  const vitestFiles = yield* Schema.decode(VitestFilesList)(rawVitestListOutput)
  // TODO: add a filter option to cli
  // .filter((f) => f.file.includes("attributify"))
  const nTestFiles = vitestFiles.length
  yield* Effect.logInfo(`Found ${nTestFiles} test files in project`)

  const runTestFile = (file: string, runner: Parameters<typeof RunTestFile>[0]["runner"] = false) =>
    Effect.gen(function*() {
      const relPath = path.relative(cwd, file)
      const result = yield* RunTestFile({ file, runner })
      yield* Effect.logInfo(`${result.success ? "[PASS]" : "[FAIL]"} ${relPath}`)
      return result
    })

  const projectReport = {
    project: cwd,
    flakyTests: [] as Array<{
      file: string
      reports: Array<RoundReport | undefined>
    }>,
    failedTests: [] as Array<any>
  }

  yield* Effect.logInfo(`Starting analysis with order: ${order}, rounds: ${rounds}, seed: ${seed}`)

  for (const { file, i } of vitestFiles.map((x, i) => ({ ...x, i }))) {
    const relPath = path.relative(cwd, file)
    yield* Effect.logInfo(`[${i + 1}/${nTestFiles}] Analyzing test file: ${relPath}`)
    yield* Effect.logInfo(`Found ${projectReport.flakyTests.length} flaky tests so far`)
    const [original, ...shuffled] = yield* Effect.all([
      runTestFile(file, { order: "original" }),
      ...Array.range(1, rounds)
        .map((i) => runTestFile(file, { order, seed: `${(seed + i - 1)}` }))
    ], { concurrency: "inherit" })

    if (!original.success) {
      projectReport.failedTests.push(original)
    }

    const hasFlaked = Array.some(shuffled, (r) => r.success !== original.success)
    if (hasFlaked) {
      yield* Effect.logInfo(`Order Dependent Flaky test detected: ${relPath}`)
      projectReport.flakyTests.push({
        file: relPath,
        reports: [original.report, ...shuffled.map((r) => r.report)]
      })
    }
  }

  yield* Effect.logInfo(`Ran analysis of ${nTestFiles} test files in project at: ${cwd}`)
  yield* Effect.logInfo(
    `Detected ${projectReport.flakyTests.length} flaky tests with order ${order} and ${rounds} rounds:`
  )
  for (const flakyTest of projectReport.flakyTests) {
    yield* Effect.logInfo(`- ${flakyTest.file}`)
  }
  yield* Effect.logInfo(`Total passed tests in original order: ${nTestFiles - projectReport.failedTests.length}`)
  yield* Effect.logInfo(`Total failed tests in original order: ${projectReport.failedTests.length}`)

  yield* Option.match(out, {
    onNone: () => display(JSON.stringify(projectReport, null, 2)),
    onSome: (out) =>
      fs.writeFileString(out, JSON.stringify(projectReport, null, 2)).pipe(
        Effect.as(Effect.logInfo(`Wrote report to file: ${out}`))
      )
  })
})
