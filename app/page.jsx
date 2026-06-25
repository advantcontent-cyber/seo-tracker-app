"use client";
import dynamic from "next/dynamic";

// The dashboard is fully client-side (uses window/localStorage, FileReader,
// Blob downloads), so render it client-only to avoid SSR window errors.
const SeoTracker = dynamic(() => import("../components/SeoTracker"), { ssr: false });

export default function Page() {
  return <SeoTracker />;
}
