import * as Command from "@effect/platform/Command"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { make as CommandMake } from "./Command.js"
import { GenId } from "./GenId.js"
import type { TestOrder } from "./template-runner.js"
import type { SerializedSuite, SerializedTest } from "./Types.js"
import { RoundReport } from "./Types.js"
import { runString } from "./Utils.js"

// TODO: add TRUNCATE_AFTER environment variable
export const RunTestFile = ({
  file,
  runner = false
}: {
  file: string
  // custom runner options
  runner?: false | {
    order?: TestOrder | undefined
    seed?: string | undefined
  }
}) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const cmd = "npx"
    const args: Array<string> = [
      "vitest",
      "run",
      file
    ]
    const env: Record<string, string> = {}
    let reportPath: string | undefined = undefined
    const keep = yield* Config.boolean("KEEP").pipe(Config.withDefault(false))

    if (runner) {
      const path = yield* Path.Path
      const workingDirectory = yield* Config.string("PROJECT_DIRECTORY")

      const { genId } = yield* GenId
      const id = genId()

      const dir = yield* (keep ? fs.makeTempDirectory : fs.makeTempDirectoryScoped)({
        directory: workingDirectory,
        prefix: `.tsv-tod-tmp-${id}-`
      })

      const templateRunnerPath = path.resolve(import.meta.dirname, "template-runner.ts")
      const templateRunnerProjectPath = path.resolve(dir, `runner.ts`)

      const templateVitestConfigPath = path.resolve(import.meta.dirname, "template-vitest.config.ts")
      const templateVitestConfigProjectPath = path.resolve(dir, `vitest.config.ts`)

      reportPath = path.resolve(dir, `report.json`)

      let configPath = path.resolve(workingDirectory, "vite.config.ts")
      if (yield* fs.exists(configPath)) {
        configPath = configPath.slice(0, -3) // remove .ts
      } else if (yield* fs.exists(configPath = path.resolve(workingDirectory, "vitest.config.ts"))) {
        configPath = configPath.slice(0, -3) // remove .ts
      } else {
        const dummy = path.resolve(dir, `dummy.config.ts`)
        yield* fs.writeFileString(dummy, "export default {}\n")
        configPath = dummy.slice(0, -3) // remove .ts
      }

      yield* fs.copyFile(templateRunnerPath, templateRunnerProjectPath)
      const vitestFileContent = (yield* fs.readFileString(templateVitestConfigPath))
        .replaceAll("{{cwd}}", path.resolve(workingDirectory))
        .replaceAll("{{configPath}}", configPath)
      // yield* fs.copyFile(templateVitestConfigPath, templateVitestConfigProjectPath)
      yield* fs.writeFileString(templateVitestConfigProjectPath, vitestFileContent)

      args.push("--config", templateVitestConfigProjectPath)

      env["TSV_TOD_RUNNER_PATH"] = templateRunnerProjectPath
      env["TSV_TOD_TEMP_DIR"] = dir
      env["TSV_TOD_TEST_ORDER"] = runner.order ?? "original"
      if (runner.seed) {
        env["TSV_TOD_SEED"] = runner.seed
      }
    }

    yield* (keep ? Effect.logInfo : Effect.logDebug)(
      `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ")} ${cmd} ${args.join(" ")}`
    )
    const vitestRunCmd = yield* CommandMake({ cmd, args, env })

    // Start running the command and return a handle to the running process
    const { exitCode, stderr, stdout } = yield* Command.start(vitestRunCmd).pipe(
      Effect.flatMap((process) =>
        Effect.all(
          {
            // Waits for the process to exit and returns
            // the ExitCode of the command that was run
            exitCode: process.exitCode,
            // The standard output stream of the process
            stdout: runString(process.stdout),
            // The standard error stream of the process
            stderr: runString(process.stderr)
          },
          { concurrency: "unbounded" }
        )
      )
    )

    if (reportPath) {
      const reportExists = yield* fs.exists(reportPath)
      if (reportExists) {
        const reportContent = yield* fs.readFileString(reportPath)
        const parsedReport = yield* Schema.decode(RoundReport)(reportContent)
        return { exitCode, stdout, stderr, report: parsedReport }
      }
    }

    return { exitCode, stdout, stderr }
  }).pipe(
    Effect.scoped,
    Effect.timeout("30 seconds"),
    Effect.andThen(({ exitCode, report, ...rest }) =>
      Effect.succeed({
        file,
        exitCode,
        success: report?.shuffledSuite
          ? taskAllPassed(report.shuffledSuite)
          : exitCode === 0,
        report,
        ...rest
      })
    ),
    Effect.catchAll((error) =>
      Effect.logError(`Error occurred while running test file ${file}: ${error}`)
        .pipe(Effect.as({ file, error, success: false, report: undefined }))
    )
  )

function taskAllPassed(task: SerializedSuite | SerializedTest): boolean {
  if (task.type === "test") {
    return task.state === "pass"
  }
  return task.taskGroups.every((group) => group.tasks.every(taskAllPassed))
}
