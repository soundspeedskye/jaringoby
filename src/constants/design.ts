export const palette = {
  cream: '#FDF6E3',
  paper: '#FFFDF7',
  green: '#2F715D',
  greenSoft: '#6D9A88',
  yellow: '#F0B92E',
  coral: '#E98762',
  coralText: '#A84F3D',
  ink: '#343128',
  muted: '#756F64',
  line: '#DED5BF',
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

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

export const shadow = {
  shadowColor: palette.ink,
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 7,
} as const;
