import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const preferredSourceIcon = path.join(rootDir, "build", "icon-source.png");
const fallbackSourceIcon = path.join(rootDir, "public", "icon.png");
const buildDir = path.join(rootDir, "build");
const iconsDir = path.join(buildDir, "icons");
const appxAssetsDir = path.join(buildDir, "appx");

const targets = [
  { file: "StoreLogo.png", width: 50, height: 50, destination: "appx" },
  { file: "StoreLogo.scale-100.png", width: 50, height: 50, destination: "appx" },
  { file: "StoreLogo.scale-125.png", width: 63, height: 63, destination: "appx" },
  { file: "StoreLogo.scale-150.png", width: 75, height: 75, destination: "appx" },
  { file: "StoreLogo.scale-200.png", width: 100, height: 100, destination: "appx" },
  { file: "StoreLogo.scale-400.png", width: 200, height: 200, destination: "appx" },

  { file: "Square44x44Logo.png", width: 44, height: 44, destination: "appx" },
  { file: "Square44x44Logo.scale-100.png", width: 44, height: 44, destination: "appx" },
  { file: "Square44x44Logo.scale-125.png", width: 55, height: 55, destination: "appx" },
  { file: "Square44x44Logo.scale-150.png", width: 66, height: 66, destination: "appx" },
  { file: "Square44x44Logo.scale-200.png", width: 88, height: 88, destination: "appx" },
  { file: "Square44x44Logo.scale-400.png", width: 176, height: 176, destination: "appx" },
  { file: "Square44x44Logo.targetsize-16.png", width: 16, height: 16, destination: "appx" },
  { file: "Square44x44Logo.targetsize-24.png", width: 24, height: 24, destination: "appx" },
  { file: "Square44x44Logo.targetsize-32.png", width: 32, height: 32, destination: "appx" },
  { file: "Square44x44Logo.targetsize-48.png", width: 48, height: 48, destination: "appx" },
  { file: "Square44x44Logo.targetsize-64.png", width: 64, height: 64, destination: "appx" },
  { file: "Square44x44Logo.targetsize-256.png", width: 256, height: 256, destination: "appx" },
  { file: "Square44x44Logo.targetsize-16_altform-unplated.png", width: 16, height: 16, destination: "appx" },
  { file: "Square44x44Logo.targetsize-24_altform-unplated.png", width: 24, height: 24, destination: "appx" },
  { file: "Square44x44Logo.targetsize-32_altform-unplated.png", width: 32, height: 32, destination: "appx" },
  { file: "Square44x44Logo.targetsize-48_altform-unplated.png", width: 48, height: 48, destination: "appx" },

  { file: "Square150x150Logo.png", width: 150, height: 150, destination: "appx" },
  { file: "Square150x150Logo.scale-100.png", width: 150, height: 150, destination: "appx" },
  { file: "Square150x150Logo.scale-125.png", width: 188, height: 188, destination: "appx" },
  { file: "Square150x150Logo.scale-150.png", width: 225, height: 225, destination: "appx" },
  { file: "Square150x150Logo.scale-200.png", width: 300, height: 300, destination: "appx" },
  { file: "Square150x150Logo.scale-400.png", width: 600, height: 600, destination: "appx" },

  { file: "Wide310x150Logo.png", width: 310, height: 150, destination: "appx" },
  { file: "Wide310x150Logo.scale-100.png", width: 310, height: 150, destination: "appx" },
  { file: "Wide310x150Logo.scale-125.png", width: 388, height: 188, destination: "appx" },
  { file: "Wide310x150Logo.scale-150.png", width: 465, height: 225, destination: "appx" },
  { file: "Wide310x150Logo.scale-200.png", width: 620, height: 300, destination: "appx" },
  { file: "Wide310x150Logo.scale-400.png", width: 1240, height: 600, destination: "appx" },

  { file: "LargeTile.png", width: 310, height: 310, destination: "appx" },
  { file: "LargeTile.scale-100.png", width: 310, height: 310, destination: "appx" },
  { file: "LargeTile.scale-125.png", width: 388, height: 388, destination: "appx" },
  { file: "LargeTile.scale-150.png", width: 465, height: 465, destination: "appx" },
  { file: "LargeTile.scale-200.png", width: 620, height: 620, destination: "appx" },
  { file: "LargeTile.scale-400.png", width: 1240, height: 1240, destination: "appx" },

  { file: "SmallTile.png", width: 71, height: 71, destination: "appx" },
  { file: "SmallTile.scale-100.png", width: 71, height: 71, destination: "appx" },
  { file: "SmallTile.scale-125.png", width: 89, height: 89, destination: "appx" },
  { file: "SmallTile.scale-150.png", width: 107, height: 107, destination: "appx" },
  { file: "SmallTile.scale-200.png", width: 142, height: 142, destination: "appx" },
  { file: "SmallTile.scale-400.png", width: 284, height: 284, destination: "appx" },

  { file: "SplashScreen.png", width: 620, height: 300, destination: "appx" },
  { file: "SplashScreen.scale-100.png", width: 620, height: 300, destination: "appx" },
  { file: "SplashScreen.scale-125.png", width: 775, height: 375, destination: "appx" },
  { file: "SplashScreen.scale-150.png", width: 930, height: 450, destination: "appx" },
  { file: "SplashScreen.scale-200.png", width: 1240, height: 600, destination: "appx" },
  { file: "SplashScreen.scale-400.png", width: 2480, height: 1200, destination: "appx" },

  { file: "Square50x50Logo.png", width: 50, height: 50, destination: "legacy-build" },
  { file: "Square150x150Logo.png", width: 150, height: 150, destination: "legacy-build" },
  { file: "Square310x310Logo.png", width: 310, height: 310, destination: "legacy-build" },
  { file: "Square71x71Logo.png", width: 71, height: 71, destination: "legacy-build" },
  { file: "StoreLogo.png", width: 50, height: 50, destination: "legacy-build" },
  { file: "Wide310x150Logo.png", width: 310, height: 150, destination: "legacy-build" },
  { file: "icon.png", width: 512, height: 512, destination: "build-root" },
];

const sourceCache = new Map();

async function resolveSourceIcon() {
  try {
    await fs.access(preferredSourceIcon);
    return preferredSourceIcon;
  } catch {
    await fs.access(fallbackSourceIcon);
    return fallbackSourceIcon;
  }
}

function resolveOutputPath(file, destination) {
  if (destination === "appx") {
    return path.join(appxAssetsDir, file);
  }

  if (destination === "legacy-build") {
    return path.join(buildDir, file);
  }

  return path.join(buildDir, file);
}

async function ensureDirectories() {
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(iconsDir, { recursive: true });
  await fs.mkdir(appxAssetsDir, { recursive: true });
}

async function writeAssets(sourceIcon) {
  for (const target of targets) {
    const outputPath = resolveOutputPath(target.file, target.destination);
    const cacheKey = `${target.width}x${target.height}`;

    let buffer = sourceCache.get(cacheKey);
    if (!buffer) {
      buffer = await sharp(sourceIcon)
        .resize(target.width, target.height, { fit: "cover" })
        .png()
        .toBuffer();
      sourceCache.set(cacheKey, buffer);
    }

    await fs.writeFile(outputPath, buffer);
  }

  await fs.copyFile(path.join(buildDir, "icon.png"), path.join(iconsDir, "icon.png"));
}

async function validateAssets() {
  for (const target of targets) {
    const outputPath = resolveOutputPath(target.file, target.destination);
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
  const sourceIcon = await resolveSourceIcon();
  await ensureDirectories();
  await writeAssets(sourceIcon);
  await validateAssets();
  console.log(`Electron Windows assets generated in build/ using source: ${sourceIcon}`);
}

main().catch((error) => {
  console.error("Failed to generate Electron assets", error);
  process.exit(1);
});
