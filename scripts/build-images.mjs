#!/usr/bin/env node
/**
 * Builds the self-hosted, optimised photography used by the interface.
 *
 * Source: NASA Image and Video Library (images.nasa.gov). NASA imagery is generally not subject to
 * copyright in the United States; the script keeps the photographer and centre credit for each
 * picture, and refuses pictures whose metadata names a non-NASA rights holder.
 *
 * Usage (needs network access and `sharp`):
 *   npm install --no-save sharp
 *   node scripts/build-images.mjs
 *
 * Output:
 *   public/images/<slug>-<width>.avif|webp   responsive variants
 *   src/content/images.generated.json        dimensions, variants, blur placeholder and credits
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "scripts/images.manifest.json"), "utf8"));
const outDir = path.join(root, manifest.outputDir ?? "public/images");
const metaFile = path.join(root, manifest.metadataFile ?? "src/content/images.generated.json");
await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(metaFile), { recursive: true });

const NASA_ID = /^[A-Za-z0-9_.-]{3,80}$/;
const SLUG = /^[a-z0-9-]{2,40}$/;
const THIRD_PARTY = /(lockheed|boeing photo|getty|reuters|associated press|courtesy of(?! nasa))/i;

async function get(url, kind) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (response.ok) return kind === "json" ? response.json() : Buffer.from(await response.arrayBuffer());
    if (attempt === 3) throw new Error(`${url} answered ${response.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("unreachable");
}

const out = {};
for (const item of manifest.images) {
  if (!NASA_ID.test(item.nasaId) || !SLUG.test(item.slug)) throw new Error(`bad manifest entry ${JSON.stringify(item)}`);
  const search = await get(`https://images-api.nasa.gov/search?nasa_id=${encodeURIComponent(item.nasaId)}`, "json");
  const record = search?.collection?.items?.[0]?.data?.[0];
  if (!record) throw new Error(`${item.nasaId}: no metadata`);
  const credits = [record.photographer, record.secondary_creator, record.location, record.description].filter(Boolean).join(" ");
  if (THIRD_PARTY.test(credits)) throw new Error(`${item.nasaId}: third-party rights holder in metadata, refused`);

  const original = await get(`https://images-assets.nasa.gov/image/${item.nasaId}/${item.nasaId}~${item.source ?? "orig"}.jpg`, "binary");
  const base = sharp(original, { failOn: "error" }).rotate();
  const meta = await base.metadata();
  const crop = item.crop; // optional { left, top, width, height } as fractions of the original
  const pipeline = () => {
    let img = sharp(original).rotate();
    if (crop) {
      img = img.extract({
        left: Math.round(crop.left * meta.width),
        top: Math.round(crop.top * meta.height),
        width: Math.round(crop.width * meta.width),
        height: Math.round(crop.height * meta.height),
      });
    }
    if (item.modulate) img = img.modulate(item.modulate);
    return img;
  };
  const sourceWidth = crop ? Math.round(crop.width * meta.width) : meta.width;
  const sourceHeight = crop ? Math.round(crop.height * meta.height) : meta.height;
  const widths = (item.widths ?? manifest.widths).filter((w) => w <= sourceWidth);
  if (!widths.length) widths.push(sourceWidth);

  const variants = [];
  for (const width of widths) {
    for (const format of item.formats ?? manifest.formats) {
      const file = `${item.slug}-${width}.${format}`;
      const img = pipeline().resize({ width, withoutEnlargement: true });
      const buffer = format === "avif"
        ? await img.avif({ quality: item.avifQuality ?? 52, effort: 6 }).toBuffer()
        : await img.webp({ quality: item.webpQuality ?? 72, effort: 6 }).toBuffer();
      await writeFile(path.join(outDir, file), buffer);
      variants.push({ file, width, format, bytes: buffer.length });
    }
  }
  const lqip = await pipeline().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  out[item.slug] = {
    nasaId: item.nasaId,
    width: sourceWidth,
    height: sourceHeight,
    variants,
    placeholder: `data:image/webp;base64,${lqip.toString("base64")}`,
    credit: {
      title: record.title,
      photographer: record.photographer ?? null,
      center: record.center ?? null,
      dateCreated: record.date_created ?? null,
      source: `https://images.nasa.gov/details/${item.nasaId}`,
    },
  };
  console.log(`ok ${item.slug} ${sourceWidth}x${sourceHeight} ${variants.length} variants`);
}
await writeFile(metaFile, `${JSON.stringify(out, null, 2)}\n`);
