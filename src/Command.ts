import * as Command from "@effect/platform/Command"
import * as Effect from "effect/Effect"
import { WorkingDirectory } from "./WorkingDirectory.js"

export const make = (...args: Parameters<typeof Command.make>) =>
  Effect.gen(function*() {
    const workingDirectory = yield* WorkingDirectory
    return Command.make(...args).pipe(
      Command.workingDirectory(workingDirectory)
    )
  })
