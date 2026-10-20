import { useState } from "react";
import images from "@/content/images.generated.json";
import { cn } from "@/lib/utils";

interface Variant {
  file: string;
  width: number;
  format: string;
}
interface ImageEntry {
  nasaId: string;
  width: number;
  height: number;
  variants: Variant[];
  placeholder: string;
  credit: { title: string; photographer: string | null; center: string | null; dateCreated: string | null; source: string };
}

const catalog = images as Record<string, ImageEntry>;
export type PhotoSlug = "hangar-b777" | "turbofan-inspection" | "engine-test-control" | "engine-test-consoles";

export function photoCredit(slug: PhotoSlug): { label: string; href: string } {
  const entry = catalog[slug];
  if (!entry) return { label: "NASA", href: "https://images.nasa.gov" };
  const who = entry.credit.photographer?.replace(/^NASA\s+/i, "");
  return { label: who ? `NASA / ${who}` : `NASA ${entry.credit.center ?? ""}`.trim(), href: entry.credit.source };
}

export function allPhotoCredits() {
  return Object.entries(catalog).map(([slug, e]) => ({ slug, ...e.credit, nasaId: e.nasaId }));
}

/**
 * Responsive, self-hosted photograph (AVIF then WebP). A blurred inline preview is painted first
 * and stays in place if the file fails to load, so layout and contrast never depend on the network.
 */
export function Photo({
  slug,
  alt,
  sizes,
  className,
  imgClassName,
  priority = false,
  position = "50% 50%",
}: {
  slug: PhotoSlug;
  alt: string;
  sizes: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  position?: string;
}) {
  const entry = catalog[slug];
  const [failed, setFailed] = useState(false);
  if (!entry) return <div aria-hidden="true" className={cn("bg-sunken", className)} />;
  const byFormat = (format: string) =>
    entry.variants
      .filter((v) => v.format === format)
      .map((v) => `/images/${v.file} ${v.width}w`)
      .join(", ");
  const webp = entry.variants.filter((v) => v.format === "webp");
  const fallback = webp[Math.min(1, webp.length - 1)] ?? webp[0];

  return (
    <div
      className={cn("relative overflow-hidden bg-sunken bg-cover", className)}
      style={{ backgroundImage: `url(${entry.placeholder})`, backgroundPosition: position }}
    >
      {!failed && fallback && (
        <picture>
          <source type="image/avif" srcSet={byFormat("avif")} sizes={sizes} />
          <source type="image/webp" srcSet={byFormat("webp")} sizes={sizes} />
          <img
            src={`/images/${fallback.file}`}
            alt={alt}
            width={entry.width}
            height={entry.height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding={priority ? "sync" : "async"}
            onError={() => setFailed(true)}
            className={cn("absolute inset-0 h-full w-full object-cover", imgClassName)}
            style={{ objectPosition: position }}
          />
        </picture>
      )}
      {failed && <span className="sr-only">{alt}</span>}
    </div>
  );
}
