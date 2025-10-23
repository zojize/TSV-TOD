import * as Context from "effect/Context"

export class WorkingDirectory extends Context.Tag("WorkingDirectory")<
  WorkingDirectory,
  string
>() {}
