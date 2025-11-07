import type * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as String from "effect/String"

export const runString = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>
): Effect.Effect<string, E, R> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(String.empty, String.concat)
  )
