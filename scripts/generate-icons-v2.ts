/**
 * SVG -> 多尺寸 PNG 图标生成脚本
 * 用法：npx tsx scripts/generate-icons-v2.ts
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'scripts', 'icons-design');
const OUT_DIR = path.join(ROOT, 'scripts', 'icons-design', 'preview');

const SIZES = [16, 32, 48, 128] as const;
const VARIANTS = ['a', 'b', 'c'] as const;

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const variant of VARIANTS) {
    const svgPath = path.join(SRC_DIR, `icon-${variant}.svg`);
    const svgBuf = readFileSync(svgPath);

    for (const size of SIZES) {
      const outPath = path.join(OUT_DIR, `icon-${variant}-${size}.png`);
      await sharp(svgBuf, { density: 300 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outPath);
      console.warn(`[icons] icon-${variant}-${size}.png`);
    }

    // 生成 256 预览大图，方便在对话里展示
    const previewPath = path.join(OUT_DIR, `preview-${variant}.png`);
    await sharp(svgBuf, { density: 300 })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(previewPath);
  }

  console.warn('[icons] 全部生成完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
