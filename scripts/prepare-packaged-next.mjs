import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const prismaNamespaceDir = path.join(projectRoot, ".next", "node_modules", "@prisma");
const prismaRuntimeSourceDir = path.join(projectRoot, "node_modules", ".prisma");
const prismaRuntimeTargetDir = path.join(projectRoot, ".prisma");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function preparePrismaAliases() {
  if (!(await exists(prismaNamespaceDir))) {
    console.log("[prepare:packaging] No .next Prisma namespace directory found. Skipping.");
    return;
  }

  const entries = await fs.readdir(prismaNamespaceDir, { withFileTypes: true });
  const aliases = entries.filter((entry) => /^client-[a-f0-9]+$/u.test(entry.name));

  if (aliases.length === 0) {
    console.log("[prepare:packaging] No hashed Prisma aliases found. Skipping.");
    return;
  }

  for (const alias of aliases) {
    const aliasPath = path.join(prismaNamespaceDir, alias.name);
    const stats = await fs.lstat(aliasPath);

    if (stats.isSymbolicLink()) {
      await fs.unlink(aliasPath);
      await fs.mkdir(aliasPath, { recursive: true });
      await fs.writeFile(
        path.join(aliasPath, "index.js"),
        'module.exports = require("@prisma/client");\n',
        "utf8",
      );
      await fs.writeFile(
        path.join(aliasPath, "package.json"),
        JSON.stringify({
          name: `@prisma/${alias.name}`,
          private: true,
          main: "index.js",
        }, null, 2),
        "utf8",
      );
      console.log(`[prepare:packaging] Converted symlink alias ${alias.name} to real module.`);
      continue;
    }

    console.log(`[prepare:packaging] Alias ${alias.name} already materialized.`);
  }
}

async function copyPrismaRuntime() {
  if (!(await exists(prismaRuntimeSourceDir))) {
    console.log("[prepare:packaging] No node_modules/.prisma runtime found. Skipping copy.");
    return;
  }

  await fs.rm(prismaRuntimeTargetDir, { recursive: true, force: true });
  await fs.cp(prismaRuntimeSourceDir, prismaRuntimeTargetDir, { recursive: true });
  console.log("[prepare:packaging] Copied Prisma runtime to .prisma/ for packaged app.");
}

async function run() {
  await preparePrismaAliases();
  await copyPrismaRuntime();
}

run().catch((error) => {
  console.error("[prepare:packaging] Failed:", error);
  process.exitCode = 1;
});
