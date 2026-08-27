import type { Metadata } from "next";
import { SimilarityLab } from "@/components/similarity-lab/SimilarityLab";

export const metadata: Metadata = { title: "Similarity Lab" };

export default function SimilarityLabPage() {
  return <SimilarityLab />;
}
