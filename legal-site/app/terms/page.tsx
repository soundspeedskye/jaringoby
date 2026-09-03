import { ArticleSection, PolicyCallout } from '@/components/article-elements';
import { DocumentLayout, type TocItem } from '@/components/document-layout';

const toc: TocItem[] = [{ id: 'service', label: '서비스와 이용 자격' }, { id: 'account', label: '계정과 탈퇴' }, { id: 'content', label: '기록과 커뮤니티' }, { id: 'safety', label: '신고와 이용 제한' }, { id: 'operation', label: '운영과 약관 변경' }, { id: 'contact', label: '문의' }];

export default function TermsPage() {
  return <DocumentLayout eyebrow="terms of service" title="이용약관" intro="zaringovy를 편안하고 안전하게 이용하기 위한 약속입니다." toc={toc} noticeTitle="서비스 이용 약속" notice="zaringovy는 만 14세 이상 이용자를 위한 서비스입니다. 타인의 권리와 안전을 해치는 콘텐츠는 허용하지 않습니다.">
    <ArticleSection id="service" number="01" title="서비스와 이용 자격"><p>zaringovy는 이용자가 개인 지출을 기록하고, 다른 이용자와 챌린지 방에서 기록과 진행 상황을 공유할 수 있도록 돕는 서비스입니다. 이용자는 본 약관과 관련 법령을 지키며 서비스를 이용해야 합니다.</p><p>서비스는 만 14세 이상만 이용할 수 있습니다. 운영자는 이용 자격 확인이 필요하다고 판단되는 경우 필요한 조치를 요청하거나 이용을 제한할 수 있습니다.</p></ArticleSection>
    <ArticleSection id="account" number="02" title="계정과 탈퇴"><p>이용자는 정확한 이메일 주소와 안전한 비밀번호를 사용해 계정을 관리해야 하며, 자신의 계정에서 일어난 활동에 책임이 있습니다. 계정의 무단 사용 또는 보안 문제가 의심되면 즉시 운영자에게 알려 주세요.</p><PolicyCallout><strong>계정 탈퇴</strong><span>이용자는 앱 안에서 언제든지 탈퇴를 요청할 수 있습니다. 요청 즉시 서비스 이용이 중지되며, 법령상 보관 의무가 없는 개인정보는 바로 영구 삭제됩니다.</span></PolicyCallout></ArticleSection>
    <ArticleSection id="content" number="03" title="기록과 커뮤니티"><p>이용자가 작성한 지출 기록, 사진, 댓글, 게시물, 반응 및 투표 등 콘텐츠의 권리는 원칙적으로 작성자에게 있습니다. 다만 서비스 제공과 방 참여자에게 콘텐츠를 표시하기 위해 필요한 범위에서 운영자에게 이용을 허락합니다.</p><p>챌린지 방에 작성한 콘텐츠는 해당 방의 참여자에게 공개될 수 있습니다. 다른 사람의 개인정보, 연락처, 사생활 또는 저작물을 권한 없이 공개하거나 이용해서는 안 됩니다.</p></ArticleSection>
    <ArticleSection id="safety" number="04" title="신고와 이용 제한"><p>괴롭힘, 혐오·욕설, 사칭, 개인정보 노출, 부적절한 이미지, 스팸, 불법 정보, 저작권 침해 등 다른 이용자나 서비스의 안전을 해치는 행동은 금지됩니다.</p><p>이용자는 문제가 되는 콘텐츠나 이용자를 신고하거나 차단할 수 있습니다. 운영자는 신고 내용을 검토해 콘텐츠의 노출 제한·삭제, 경고, 일시 또는 영구 이용 제한 등 필요한 조치를 할 수 있습니다.</p></ArticleSection>
    <ArticleSection id="operation" number="05" title="운영과 약관 변경"><p>운영자는 서비스의 안정성, 보안 또는 품질을 위해 서비스 전부 또는 일부를 변경·점검·중단할 수 있습니다. 이용자에게 중요한 영향을 주는 변경이나 약관 개정은 적용일과 변경 내용을 앱 또는 이 페이지에 미리 알립니다.</p><p>무료로 제공되는 서비스의 운영 중단이나 기능 변경으로 이용자에게 통상적으로 기대하기 어려운 손해가 발생한 경우를 제외하고, 운영자는 관련 법령이 허용하는 범위에서 책임을 부담합니다.</p></ArticleSection>
    <ArticleSection id="contact" number="06" title="문의"><p>서비스 이용, 콘텐츠 신고, 약관 관련 문의는 <a className="text-link" href="mailto:dev.youn.cheon@gmail.com">dev.youn.cheon@gmail.com</a>으로 보내 주세요.</p><p className="updated-note">시행일: 2026년 9월 1일</p></ArticleSection>
  </DocumentLayout>;
}
