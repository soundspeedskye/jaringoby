import Link from 'next/link';

export function ZaringovyMark() { return <Link className="brand" href="/" aria-label="zaringovy 안심 센터 홈"><span className="brand-mark" aria-hidden="true">Z</span><span>zaringovy</span></Link>; }

export function SiteHeader({ showNav = true }: { showNav?: boolean }) { return <header className="site-header"><div className="page-width header-inner"><ZaringovyMark />{showNav && <nav aria-label="주요 메뉴"><Link href="/privacy">서비스 문서</Link><Link href="/support">고객지원</Link></nav>}</div></header>; }
