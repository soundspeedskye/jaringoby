import Link from 'next/link';
import { ChevronRight, FileLock2, Headphones, LockKeyhole, Scale, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';

const guides = [
  { href: '/privacy', title: '개인정보처리방침', icon: FileLock2, tone: 'green' },
  { href: '/terms', title: '이용약관', icon: Scale, tone: 'green' },
  { href: '/support', title: '고객지원', icon: Headphones, tone: 'yellow' },
];

export default function Home() {
  return <div className="site-frame trust-center-page"><SiteHeader showNav={false} /><main className="center-hero"><section className="center-intro"><ShieldCheck className="center-shield" size={80} strokeWidth={1.35} aria-hidden="true" /><h1>안심 센터</h1><span className="center-rule" aria-hidden="true" /><p>zaringovy는 투명한 정보 제공과 안전한 데이터 관리를 최우선으로 생각합니다.</p><aside className="center-promise"><LockKeyhole size={52} strokeWidth={1.35} aria-hidden="true" /><div><strong>내 정보는 내가 통제합니다.</strong><span>필요한 정보만 수집하고 안전하게 보호합니다.</span></div></aside></section><nav className="ticket-stack" aria-label="안심 센터 안내">{guides.map(({ href, title, icon: Icon, tone }) => <Link className={`ticket-card ${tone}`} href={href} key={href}><span className="ticket-icon"><Icon size={75} strokeWidth={1.2} /></span><span className="ticket-divider" aria-hidden="true" /><strong>{title}</strong><ChevronRight className="ticket-arrow" size={38} strokeWidth={1.45} aria-hidden="true" /></Link>)}</nav></main><footer className="center-footer" aria-hidden="true"><span /><i>✦</i><span /></footer></div>;
}
