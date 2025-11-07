import * as Context from "effect/Context"

export class GenId extends Context.Tag("GenId")<
  GenId,
  {
    genId(): string
  }
>() {}

let id = 0
export const genId = GenId.of({
  genId() {
    return (id++).toString(16).padStart(4, "0")
  }
})
