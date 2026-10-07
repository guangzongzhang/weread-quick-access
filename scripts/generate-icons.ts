/**
 * 图标生成脚本：从 scripts/icons-design/icon-a.svg 生成 16/32/48/128 PNG 到 public/icons/
 *
 * 用法：npm run icons
 *
 * 设计源文件：scripts/icons-design/icon-a.svg（方案 A：微信读书绿圆角方底 + 白色书本 + 对话气泡）
 * 如需更换图标，修改 SVG 后重新运行本脚本即可。
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'scripts', 'icons-design', 'icon-a.svg');
const OUT = path.join(ROOT, 'public', 'icons');

const SIZES = [16, 32, 48, 128] as const;

async function main(): Promise<void> {
  if (!existsSync(SRC)) {
    console.error(`[icons] 源 SVG 不存在: ${SRC}`);
    process.exit(1);
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const svgBuf = readFileSync(SRC);

  for (const size of SIZES) {
    const outPath = path.join(OUT, `icon${size}.png`);
    await sharp(svgBuf, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.warn(`[icons] icon${size}.png (${size}x${size})`);
  }

  console.warn('[icons] 生成完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
