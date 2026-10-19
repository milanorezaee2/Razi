import NextImage, { type ImageProps } from "next/image";

/**
 * Shared high-fidelity image component for the storefront and dashboards.
 * Next.js chooses the responsive output width; this sets the optimizer to its
 * highest supported visual-quality setting without upscaling source pixels.
 */
export default function SiteImage({ quality = 100, ...props }: ImageProps) {
  return <NextImage {...props} quality={quality} />;
}
