import { execSync } from "node:child_process"
import * as fs from "node:fs"

const vitestProjects = "vitest-projects"
const reportsDir = "reports"

const setup: Record<string, (_: { projectPath: string }) => void> = {
  "vueuse": ({ projectPath }) => {
    execSync("pnpm run build", { cwd: projectPath, stdio: "inherit" })
  }
}

const owners = fs.readdirSync(vitestProjects, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)

for (const owner of owners) {
  const ownerPath = `${vitestProjects}/${owner}`
  const projects = fs.readdirSync(ownerPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)

  for (const name of projects) {
    const projectPath = `${ownerPath}/${name}`
    const outPath = `${reportsDir}/report-${owner}_${name}.json`
    // if (fs.existsSync(outPath)) {
    //   console.log(`Skipping ${owner}/${name}, report already exists at ${outPath}`)
    //   continue
    // }
    setup[name]?.({ projectPath })
    const cmd = `bun run dev -- --order random-test --out ${outPath} --rounds=10 ${projectPath}`
    console.log(`Running: ${cmd}`)
    execSync(cmd, { stdio: "inherit" })
  }
}
