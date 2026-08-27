import Image from "next/image";

export function LibraryMapStill({ className = "" }: { className?: string }) {
  return (
    <figure className={className}>
      <div className="relative aspect-[5/4] overflow-hidden rounded-[14px] border border-[#1F232B] shadow-[0_50px_100px_-60px_#000] md:aspect-[1325/911]">
        <Image
          src="/landing/library-map.png"
          alt="Crate Dig library map: records arranged as colored clusters by sonic similarity, with a track list and Q assistant panel showing recommendations for a selected record"
          width={1325}
          height={911}
          priority
          sizes="(max-width: 768px) 100vw, 1240px"
          className="h-full w-full object-cover object-[58%_38%] md:object-center md:object-cover"
        />
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-paper-dim">
        Library map · arranged by sonic similarity
      </figcaption>
    </figure>
  );
}
