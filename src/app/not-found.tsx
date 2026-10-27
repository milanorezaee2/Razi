import { NotFoundView } from "@/components/ui/NotFoundView";

/**
 * Root 404 for unmatched URLs (e.g. /fa/unknown-page) which never descend
 * into the [locale] segment, so the locale not-found boundary is bypassed.
 */
export default function RootNotFound() {
  return <NotFoundView bare />;
}
