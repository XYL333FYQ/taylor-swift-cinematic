import type { CSSProperties, RefObject } from 'react';

export function VinylRecord({
  cover,
  label,
  vinylRef,
}: {
  cover: string;
  label: string;
  vinylRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="vinyl-record" role="img" aria-label={label}>
      <div className="vinyl-record-disc" ref={vinylRef}>
        <span className="vinyl-record-reflection" aria-hidden="true" />
        <span className="vinyl-record-label" style={{ '--vinyl-label-image': `url("${cover}")` } as CSSProperties} />
        <span className="vinyl-record-hole" aria-hidden="true" />
      </div>
    </div>
  );
}
