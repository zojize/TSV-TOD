import * as Command from "@effect/platform/Command"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { make as CommandMake } from "./Command.js"

export const VitestFile = Schema.Struct({
  file: Schema.String,
  project: Schema.String.pipe(Schema.optional)
})
export type VitestFile = Schema.Schema.Type<typeof VitestFile>

export const RunTestFile = ({
  file,
  shuffle = false
}: {
  file: string
  shuffle?: boolean
}) =>
  Effect.gen(function*() {
    const vitestRunCmd = yield* CommandMake(
      "npx",
      "vitest",
      "run",
      ...shuffle ? ["--sequence.shuffle.tests"] : [],
      file
    )

    return yield* Command.exitCode(vitestRunCmd)
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.andThen((exitCode) => Effect.succeed({ file, exitCode, success: exitCode === 0 })),
    Effect.catchAll((error) => Effect.succeed({ file, error, success: false }))
  )
