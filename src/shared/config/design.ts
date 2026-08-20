import type { TextStyle, ViewStyle } from 'react-native';

// 디자인 방향: "종이 가계부"(01) 베이스 + 숫자 가독성(03).
// - 재질은 반투명 유리·소프트 섀도 대신 종이/괘선/테두리로 표현한다.
// - 위계는 큰 라운드가 아니라 라인과 타이포로 만든다.
// - 숫자는 탭룰러 정렬로 스캔이 쉽게(가계부/영수증) 유지한다.
// - 예외 하나: 하단 탭바는 콘텐츠가 아니라 그 위에 떠 있는 크롬 레이어라 리퀴드 글래스를
//   허용한다(glass 토큰). 콘텐츠 표면(GlassSurface·카드·시트)은 종이 그대로 둔다.

export const palette = {
  cream: '#FBF4E1', // 앱 배경 (장부 종이)
  paper: '#FFFDF4', // 카드·항목 표면 (밝은 속지)
  green: '#2F715D', // 잉크 그린 (주 색·강조 텍스트)
  greenSoft: '#6D9A88', // 보조 그린 (아이콘·서브)
  yellow: '#F0B92E', // 하이라이트 (달성·왕관)
  coral: '#E98762',
  coralText: '#A84F3D',
  ink: '#2A2620', // 본문 먹색 (약간 따뜻한 near-black)
  muted: '#8A7F63', // 보조 텍스트 (바랜 잉크)
  line: '#D8C9A0', // 기본 테두리·괘선 (진한 선)
  lineStrong: '#C6B58B', // 공지처럼 흐름에서 한 단계 도드라져야 하는 카드 테두리
  rule: '#E7DBBB', // 항목 구분용 얇은 괘선 (연한 선)
  stamp: '#C0392B', // 도장 붉은색 (초과·1위 인장 강조)
  danger: '#B65348',
  success: '#397B58',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

// 종이 각을 위해 반경을 크게 낮춘다. (이전 10/16/24/30 → 4/6/10/14)
export const radii = {
  sm: 4,
  md: 6,
  lg: 10,
  xl: 14,
  pill: 999,
} as const;

// 소프트 플로팅 섀도를 걷어내고, 종이가 살짝 뜬 정도로만 남긴다.
// 대부분의 표면은 shadow 대신 border(palette.line)로 경계를 만든다.
export const shadow = {
  shadowColor: palette.ink,
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const satisfies ViewStyle;

// 리퀴드 글래스 토큰. 하단 탭바 한 겹에만 쓴다.
// iOS 기본 청회색 유리를 크림 쪽으로 당겨 "장부 위에 얹힌 유산지"로 읽히게 한다.
// alpha를 더 올리면 유리가 탁해지고, 더 내리면 배경색이 파랗게 돈다.
export const glass = {
  tint: 'rgba(251, 244, 225, 0.42)', // palette.cream + alpha
} as const;

const tabBarRowHeight = 56;
const tabBarCapsulePaddingY = spacing.xs;

// 하단 탭바 기하. 유리 경로(떠 있는 캡슐)와 종이 경로(도킹된 시트)가 화면을 가리는
// 높이가 서로 달라, 콘텐츠 하단 여백을 상수로 둘 수 없다.
// 실제 여백 계산은 use-tab-bar-clearance가 이 값들로 한다.
export const tabBar = {
  rowHeight: tabBarRowHeight, // 탭 아이템 최소 높이 (두 경로 공통)
  capsulePaddingY: tabBarCapsulePaddingY, // 캡슐 내부 상하 패딩
  capsuleHeight: tabBarRowHeight + tabBarCapsulePaddingY * 2,
  capsuleInsetX: spacing.lg, // 캡슐 좌우 여백
  capsuleGap: spacing.md, // 캡슐과 화면 하단 사이 최소 간격 (세이프에어리어가 크면 그쪽)
  sheetPaddingTop: spacing.sm, // 시트 상단 패딩
  sheetGap: spacing.sm, // 시트 하단 최소 간격 (세이프에어리어가 크면 그쪽)
  contentGap: spacing.xxl, // 탭바와 마지막 콘텐츠 사이 숨 쉴 틈
  maxWidth: 520, // 콘텐츠 폭(Screen)과 맞춘다
} as const;

// 서체 토큰. 패밀리명은 _layout.tsx useFonts의 key와 일치한다.
// 결정: 제목·본문·숫자를 IBM Plex Sans KR로 통일한다.
//   hand/number = IBM Plex Sans KR Regular — 본문·보조 정보·일반 금액.
//   handBold = IBM Plex Sans KR SemiBold — 제목·강조 텍스트·주요 금액.
export const fonts = {
  hand: 'IBMPlexSansKR-Regular',
  handBold: 'IBMPlexSansKR-SemiBold',
  number: 'IBMPlexSansKR-SemiBold',
} as const;

// 숫자 정렬 헬퍼. 금액·통계 등 자릿수가 흔들리면 안 되는 곳에 붙인다.
export const tabularNums = { fontVariant: ['tabular-nums'] } as const satisfies TextStyle;
