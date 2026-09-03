import Link from 'next/link';
import { ZaringovyMark } from '@/components/site-header';

export function SiteFooter() { return <footer className="site-footer"><div className="page-width footer-inner"><div><ZaringovyMark /><p>일상 기록을 조금 더 가볍고 편안하게.</p></div><div className="footer-links" aria-label="푸터 메뉴"><Link href="/privacy">개인정보처리방침</Link><Link href="/terms">이용약관</Link><Link href="/support">고객지원</Link></div></div><div className="page-width footer-bottom"><span>© 2026 zaringovy. All rights reserved.</span><span>최종 업데이트: 2026년 9월 1일</span></div></footer>; }
