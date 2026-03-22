import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourceIcon = path.join(rootDir, "public", "icon.png");
const buildDir = path.join(rootDir, "build");
const iconsDir = path.join(buildDir, "icons");

const targets = [
  { file: "StoreLogo.png", width: 50, height: 50 },
  { file: "Square44x44Logo.png", width: 44, height: 44 },
  { file: "Square50x50Logo.png", width: 50, height: 50 },
  { file: "Square150x150Logo.png", width: 150, height: 150 },
  { file: "Square310x310Logo.png", width: 310, height: 310 },
  { file: "Wide310x150Logo.png", width: 310, height: 150 },
  { file: "icon.png", width: 512, height: 512 },
];

async function ensureDirectories() {
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(iconsDir, { recursive: true });
}

async function writeAssets() {
  for (const target of targets) {
    const outputPath = path.join(buildDir, target.file);
    await sharp(sourceIcon)
      .resize(target.width, target.height, { fit: "cover" })
      .png()
      .toFile(outputPath);
  }

  await fs.copyFile(path.join(buildDir, "icon.png"), path.join(iconsDir, "icon.png"));
}

async function validateAssets() {
  for (const target of targets) {
    const outputPath = path.join(buildDir, target.file);
    const metadata = await sharp(outputPath).metadata();

    if (metadata.width !== target.width || metadata.height !== target.height) {
      throw new Error(
        `Invalid icon size for ${target.file}. Expected ${target.width}x${target.height}, got ${metadata.width}x${metadata.height}`,
      );
    }
  }

  await fs.access(path.join(iconsDir, "icon.png"));
}

async function main() {
  await ensureDirectories();
  await writeAssets();
  await validateAssets();
  console.log("Electron Windows assets generated in build/");
}

main().catch((error) => {
  console.error("Failed to generate Electron assets", error);
  process.exit(1);
});
