import * as Command from "@effect/platform/Command"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"

export const make = ({
  args = [],
  cmd,
  env
}: {
  cmd: string
  args?: Array<string>
  env?: Record<string, string>
}) =>
  Effect.gen(function*() {
    const workingDirectory = yield* Config.string("PROJECT_DIRECTORY")
    if (env) {
      return Command.make(cmd, ...args).pipe(
        Command.workingDirectory(workingDirectory),
        Command.env(env)
      )
    } else {
      return Command.make(cmd, ...args).pipe(
        Command.workingDirectory(workingDirectory)
      )
    }
  })
