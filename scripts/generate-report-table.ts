import { readdirSync, readFileSync, statSync } from "node:fs"
import * as path from "node:path"

const reportsDir = path.resolve("reports")
const vitestProjectsDir = path.resolve("vitest-projects")

interface ReportData {
  readonly project: string
  readonly flakyTests: ReadonlyArray<unknown>
  readonly failedTests: ReadonlyArray<unknown>
  readonly totalTestFiles?: number
}

interface ProjectRow {
  projectLabel: string
  odTestFiles: number
  odTests: number
  totalTestFiles: number | null
}

interface TaskGroupLike {
  readonly tasks?: ReadonlyArray<TaskNodeLike>
}

type TaskNodeLike = SuiteNodeLike | TestNodeLike | undefined | null

interface SuiteNodeLike {
  readonly type?: string
  readonly name?: string
  readonly taskGroups?: ReadonlyArray<TaskGroupLike>
}

interface TestNodeLike {
  readonly type?: string
  readonly name?: string
  readonly state?: string
}

function listReportFiles(dir: string): ReadonlyArray<string> {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file))
    .filter((file) => statSync(file).isFile())
}

function deriveProjectLabel(projectPath: string): { label: string; resolvedPath: string } {
  const resolved = path.resolve(projectPath)
  const relativeToVitest = path.relative(vitestProjectsDir, resolved)
  if (relativeToVitest.startsWith("..")) {
    return { label: resolved, resolvedPath: resolved }
  }
  const segments = relativeToVitest.split(path.sep).filter(Boolean)
  const label = segments.slice(0, 2).join("/") || relativeToVitest || resolved
  return { label, resolvedPath: resolved }
}

function parseReport(filePath: string): ReportData {
  const json = readFileSync(filePath, "utf8")
  return JSON.parse(json) as ReportData
}

function collectFailingTestsFromSuite(suite: TaskNodeLike, sink: Set<string>) {
  if (!suite || typeof suite !== "object") {
    return
  }

  if (suite.type === "test") {
    const testNode = suite as TestNodeLike
    if (testNode.state === "fail" && testNode.name) {
      sink.add(testNode.name)
    }
    return
  }

  if (suite.type === "suite") {
    const groups = (suite as SuiteNodeLike).taskGroups ?? []
    for (const group of groups) {
      const tasks = group?.tasks ?? []
      for (const task of tasks) {
        collectFailingTestsFromSuite(task, sink)
      }
    }
  }
}

function collectOdTestNames(flake: any): Set<string> {
  const names = new Set<string>()
  const reports: ReadonlyArray<any> = Array.isArray(flake?.reports) ? flake.reports : []
  for (const report of reports) {
    const suite = report?.shuffledSuite ?? report?.shuffleSuite
    collectFailingTestsFromSuite(suite, names)
  }
  return names
}

function createProjectRows(): Array<ProjectRow> {
  const rows: Array<ProjectRow> = []
  const reportFiles = listReportFiles(reportsDir)

  for (const filePath of reportFiles) {
    const data = parseReport(filePath)
    const label = deriveProjectLabel(data.project).label
    const totalTestFiles = typeof data.totalTestFiles === "number" ? data.totalTestFiles : null
    const flakyTests = Array.isArray(data.flakyTests) ? data.flakyTests : []
    const odTestNames = new Set<string>()
    for (const flake of flakyTests) {
      const names = collectOdTestNames(flake)
      for (const name of names) {
        odTestNames.add(name)
      }
    }

    rows.push({
      projectLabel: label,
      odTestFiles: data.flakyTests.length,
      odTests: odTestNames.size,
      totalTestFiles
    })
  }

  return rows
}

function formatTable(rows: ReadonlyArray<ProjectRow>): string {
  const header = "| Project | OD Test Files | OD Tests | Total Test Files |"
  const separator = "| --- | --- | --- | --- |"
  const body = rows.map((row) =>
    `| ${row.projectLabel} | ${row.odTestFiles} | ${row.odTests} | ${row.totalTestFiles ?? "N/A"} |`
  )
  return [header, separator, ...body].join("\n")
}

function main() {
  const rows = createProjectRows()
    .sort((a, b) => {
      if (b.odTestFiles !== a.odTestFiles) {
        return b.odTestFiles - a.odTestFiles
      }
      return a.projectLabel.localeCompare(b.projectLabel)
    })

  const table = formatTable(rows)
  console.log(table)
}

main()
