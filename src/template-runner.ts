import type { File, Suite, Task, TaskResult, Test } from "@vitest/runner"
import fs from "node:fs"
import path from "node:path"
import { VitestTestRunner } from "vitest/runners"
import type { VitestRunner } from "vitest/suite"

// https://github.com/vitest-dev/vitest/blob/2e7b2b8b98dafc047a3bf2fc0422076ca5e346fa/packages/runner/src/utils/suite.ts#L6-L23
function partitionSuiteChildren(suite: Suite): Array<Array<Task>> {
  let tasksGroup: Array<Task> = []
  const tasksGroups: Array<Array<Task>> = []
  for (const c of suite.tasks) {
    if (tasksGroup.length === 0 || c.concurrent === tasksGroup[0].concurrent) {
      tasksGroup.push(c)
    } else {
      tasksGroups.push(tasksGroup)
      tasksGroup = [c]
    }
  }
  if (tasksGroup.length > 0) {
    tasksGroups.push(tasksGroup)
  }

  return tasksGroups
}

// https://github.com/vitest-dev/vitest/blob/main/packages/utils/src/random.ts
let seed = Date.now()

function random() {
  const x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

function shuffle<T>(array: Array<T>): Array<T> {
  let length = array.length
  const result = array.slice()

  while (length) {
    const index = Math.floor(random() * length--)

    const previous = result[length]
    result[length] = result[index]
    result[index] = previous
    ++seed
  }

  return result
}

export type TestOrder = "original" | "random-group" | "random-test" | "reverse-group" | "reverse-test"

function shuffleTaskGroups(array: Array<Array<Task>>, order: TestOrder) {
  switch (order) {
    case "original":
      return array
    case "random-group":
      return shuffle(array)
    case "random-test":
      return shuffle(array.map((group) => shuffle(group)))
    case "reverse-group":
      return array.slice().reverse()
    case "reverse-test":
      return array.map((group) => group.slice().reverse()).reverse()
  }
}

function shuffleSuite(suite: Suite, order: TestOrder) {
  if (order === "original") {
    return
  }

  const taskGroups = partitionSuiteChildren(suite)
  const shuffled = shuffleTaskGroups(taskGroups, order)
  for (const task of shuffled.flat()) {
    if (task.type === "suite") {
      shuffleSuite(task, order)
    }
  }
  suite.tasks = shuffled.flat()
}

interface SerializedTest {
  type: "test"
  name: string
  state: TaskResult["state"] | "unknown"
}

interface SerializedSuite {
  type: "suite"
  name: string
  taskGroups: Array<{
    concurrent: boolean
    tasks: Array<SerializedTest | SerializedSuite>
  }>
}

function serializeTask(task: Suite): SerializedSuite
function serializeTask(task: Test): SerializedTest
function serializeTask(task: Task): SerializedSuite | SerializedTest
function serializeTask(task: Task): SerializedSuite | SerializedTest {
  if (task.type === "suite") {
    return {
      type: "suite" as const,
      name: task.name,
      taskGroups: partitionSuiteChildren(task)
        .map((group) => ({
          concurrent: !!group[0].concurrent,
          tasks: group.map(serializeTask)
        }))
    }
  } else {
    return {
      type: "test" as const,
      name: task.name,
      state: task.result?.state ?? "unknown"
    }
  }
}

// @ts-expect-error: the config field doesn't matter here
class CustomRunner extends VitestTestRunner implements VitestRunner {
  private file?: File
  private reportJsonPath?: string
  private order: TestOrder = "original"
  private originalSuite?: SerializedSuite

  public override async onBeforeRunSuite(suite: Suite) {
    // only handle the case where suite is also File
    if (!("filepath" in suite)) {
      return super.onBeforeRunSuite(suite)
    }
    this.file = suite as File
    if (process.env.TSV_TOD_SEED) {
      seed = Number.parseInt(process.env.TSV_TOD_SEED, 10)
    }

    const tempDir = process.env.TSV_TOD_TEMP_DIR
    if (!tempDir) {
      throw new Error("TSV_TOD_TEMP_DIR is not set")
    }

    this.order = process.env.TSV_TOD_TEST_ORDER as TestOrder | undefined ?? "original"

    this.reportJsonPath = path.resolve(tempDir, `report.json`)
    this.originalSuite = serializeTask(suite)
    shuffleSuite(suite, this.order)

    fs.writeFileSync(
      this.reportJsonPath,
      JSON.stringify(
        {
          done: false,
          order: this.order,
          seed,
          originalSuite: this.originalSuite,
          shuffledSuite: serializeTask(suite)
        },
        null,
        2
      )
    )

    return super.onBeforeRunSuite(suite)
  }

  public override async onAfterRunSuite(suite: Suite) {
    if (suite !== this.file) {
      return super.onAfterRunSuite(suite)
    }
    await super.onAfterRunSuite(suite)

    if (this.reportJsonPath) {
      fs.writeFileSync(
        this.reportJsonPath,
        JSON.stringify(
          {
            done: true,
            order: this.order,
            seed,
            originalSuite: this.originalSuite,
            shuffledSuite: serializeTask(suite)
          },
          null,
          2
        )
      )
    }
  }
}

export default CustomRunner
