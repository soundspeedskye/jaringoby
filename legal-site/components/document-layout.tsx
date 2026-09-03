import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export type TocItem = { id: string; label: string };
export function DocumentLayout({ eyebrow, title, intro, toc, children, noticeTitle, notice }: { eyebrow: string; title: string; intro: string; toc: TocItem[]; children: ReactNode; noticeTitle: string; notice: string }) { return <div className="site-frame"><SiteHeader /><main className="document-main page-width"><header className="document-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{intro}</p></header><div className="draft-banner"><strong>{noticeTitle}</strong><span>{notice}</span></div><details className="mobile-toc"><summary>이 문서의 목차 <ChevronDown size={17} aria-hidden="true" /></summary><TocLinks toc={toc} /></details><div className="document-grid"><aside className="document-toc"><p>ON THIS PAGE</p><TocLinks toc={toc} /></aside><article className="document-content">{children}</article></div></main><SiteFooter /></div>; }
function TocLinks({ toc }: { toc: TocItem[] }) { return <ol>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ol>; }
