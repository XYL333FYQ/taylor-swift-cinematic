import { useState, type CSSProperties } from 'react';
import { ERAS } from '@/data/eras';
import type { Language } from '@/data/i18n';

export function EraIndex({ language }: { language: Language }) {
  const [selected, setSelected] = useState(0);
  const era = ERAS[selected];
  const zh = language === 'zh';
  return (
    <section id="archive" className="era-index" style={{ '--era-accent': era.colorAccent } as CSSProperties}>
      <div className="index-heading"><div><p className="section-kicker">ON THE SHELF · 2006—2025</p><h2>{zh ? '今天想听哪一张？' : <>Take your time.<br /><em>Pick your favorite.</em></>}</h2></div><p>{zh ? '有时候选的是专辑，\n有时候选的是那一年的自己。' : 'Sometimes it is the record.\nSometimes it is who you were when you heard it.'}</p></div>
      <div className="index-layout">
        <div className="era-selector" role="group" aria-label={zh ? '选择时代' : 'Choose an era'}>{ERAS.map((item, i) => <button key={item.id} aria-pressed={selected === i} onClick={() => setSelected(i)} className={selected === i ? 'selected' : ''}><span>{item.number}</span><span>{item.name.en}</span><small>{item.year}</small><span aria-hidden="true">↗</span></button>)}</div>
        <article className="index-feature" aria-live="polite" aria-atomic="true">
          <div className="index-photo" key={era.id}><img src={era.image} alt={`Taylor Swift · ${era.name.en}`} loading="lazy" /><span>{era.year}</span></div>
          <div className="index-details"><p className="section-kicker">CHAPTER {era.number} / 12</p><h3>{era.name.en}</h3><p>{era.description[language]}</p><div className="index-facts"><span>{era.stats.tracks} {zh ? '首曲目' : 'TRACKS'}{era.id === 'ttpd' ? ' · THE ANTHOLOGY' : ''}</span><span>{era.stats.genre[language]}</span></div></div>
        </article>
      </div>
    </section>
  );
}
