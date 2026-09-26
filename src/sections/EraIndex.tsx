import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useCatalog } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import type { Language } from '@/data/i18n';

export function EraIndex({ language, onPlayAlbum }: { language: Language; onPlayAlbum: (albumId: string) => void }) {
  const { albums, yearRange } = useCatalog();
  const [selectedAlbumId, setSelectedAlbumId] = useState(albums[0]?.id ?? '');
  useEffect(() => {
    if (!albums.some((album) => album.id === selectedAlbumId)) {
      setSelectedAlbumId(albums[0]?.id ?? '');
    }
  }, [albums, selectedAlbumId]);
  const selected = Math.max(0, albums.findIndex((album) => album.id === selectedAlbumId));
  const selectorRef = useRef<HTMLDivElement>(null);
  const featureRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const list = selectorRef.current;
    const feature = featureRef.current;
    if (!list || !feature) return;

    const syncMaxHeight = () => {
      list.style.setProperty('--index-feature-height', `${feature.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(syncMaxHeight);
    observer.observe(feature);
    syncMaxHeight();
    return () => {
      observer.disconnect();
      list.style.removeProperty('--index-feature-height');
    };
  }, []);
  useEffect(() => {
    const list = selectorRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !active || list.scrollHeight <= list.clientHeight) return;
    const top = active.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' });
    else if (top + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top + active.offsetHeight - list.clientHeight, behavior: 'smooth' });
    }
  }, [selected, albums.length]);
  const era = albums.find((album) => album.id === selectedAlbumId) ?? albums[0]!;
  const zh = language === 'zh';
  return (
    <section id="archive" className="era-index" style={{ '--era-accent': era.colorAccent } as CSSProperties}>
      <div className="index-heading"><div><p className="section-kicker">ON THE SHELF · {yearRange}</p><h2>{zh ? '今天想听哪一张？' : <>Take your time.<br /><em>Pick your favorite.</em></>}</h2></div><p>{zh ? '有时候选的是专辑，\n有时候选的是那一年的自己。' : 'Sometimes it is the record.\nSometimes it is who you were when you heard it.'}</p></div>
      <div className="index-layout">
        <div ref={selectorRef} className="era-selector" role="group" aria-label={zh ? '选择时代' : 'Choose an era'}>{albums.map((item) => <button key={item.id} aria-pressed={item.id === selectedAlbumId} onClick={() => setSelectedAlbumId(item.id)} className={item.id === selectedAlbumId ? 'selected' : ''}><span>{item.number}</span><span>{item.name.en}</span>{item.year && <small>{item.year}</small>}<span aria-hidden="true">↗</span></button>)}</div>
        <article ref={featureRef} className="index-feature" aria-live="polite" aria-atomic="true">
          <div className="index-photo" key={era.id}><img src={resolveMediaUrl(era.artwork.presentation)} alt={`${era.artist ? `${era.artist} · ` : ''}${era.name.en}`} loading="lazy" />{era.year && <span>{era.year}</span>}</div>
           <div className="index-details"><p className="section-kicker">CHAPTER {era.number} / {albums.length}</p><h3>{era.name.en}</h3>{era.description[language] && <p>{era.description[language]}</p>}<div className="index-facts"><span>{era.tracks.length} {zh ? '首曲目' : 'TRACKS'}{era.archiveNote ? ` · ${era.archiveNote}` : ''}</span>{era.genre[language] && <span>{era.genre[language]}</span>}</div><button type="button" className="index-play-button" onClick={() => onPlayAlbum(era.id)}><span>{zh ? '听这一张' : 'PLAY THIS ONE'}</span><span aria-hidden="true">▶</span></button></div>
        </article>
      </div>
    </section>
  );
}
