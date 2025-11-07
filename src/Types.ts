import * as Schema from "effect/Schema"

export const VitestFile = Schema.Struct({
  file: Schema.String,
  project: Schema.String.pipe(Schema.optional)
})
export type VitestFile = Schema.Schema.Type<typeof VitestFile>

export const VitestFilesList = Schema.parseJson(Schema.NonEmptyArrayEnsure(VitestFile))
export type VitestFilesList = Schema.Schema.Type<typeof VitestFilesList>
export const TestOrder = Schema.Literal(
  "original",
  "random-group",
  "random-test",
  "reverse-group",
  "reverse-test"
)
export type TestOrder = Schema.Schema.Type<typeof TestOrder>

export const SerializedTest = Schema.Struct({
  type: Schema.Literal("test"),
  name: Schema.String,
  state: Schema.Literal("run", "skip", "only", "todo", "queued", "pass", "fail", "unknown")
})
export type SerializedTest = typeof SerializedTest.Type

export interface SerializedSuite {
  readonly type: "suite"
  readonly name: string
  readonly taskGroups: ReadonlyArray<{
    readonly concurrent: boolean
    readonly tasks: ReadonlyArray<SerializedTest | SerializedSuite>
  }>
}

export const SerializedSuite = Schema.Struct({
  type: Schema.Literal("suite"),
  name: Schema.String,
  taskGroups: Schema.Array(
    Schema.Struct({
      concurrent: Schema.Boolean,
      tasks: Schema.Array(
        Schema.Union(SerializedTest, Schema.suspend((): Schema.Schema<SerializedSuite> => SerializedSuite))
      )
    })
  )
})

export const RoundReport = Schema.parseJson(
  Schema.Struct({
    done: Schema.Boolean,
    order: TestOrder,
    seed: Schema.Number,
    originalSuite: SerializedSuite,
    shuffledSuite: SerializedSuite
  })
)
export type RoundReport = typeof RoundReport.Type
