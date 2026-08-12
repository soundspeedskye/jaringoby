import type { TextStyle, ViewStyle } from 'react-native';

// 디자인 방향: "종이 가계부"(01) 베이스 + 숫자 가독성(03).
// - 재질은 반투명 유리·소프트 섀도 대신 종이/괘선/테두리로 표현한다.
// - 위계는 큰 라운드가 아니라 라인과 타이포로 만든다.
// - 숫자는 탭룰러 정렬로 스캔이 쉽게(가계부/영수증) 유지한다.

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
