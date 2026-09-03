import type { ReactNode } from 'react';
export function ArticleSection({ id, number, title, children }: { id: string; number: string; title: string; children: ReactNode }) { return <section className="article-section" id={id}><p className="section-number">{number}</p><h2>{title}</h2><div className="article-copy">{children}</div></section>; }
export function PolicyCallout({ children }: { children: ReactNode }) { return <aside className="policy-callout">{children}</aside>; }
