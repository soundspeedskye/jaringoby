import type { ReactElement } from 'react';
import { Circle, Ellipse, G, Line, Path, Polygon } from 'react-native-svg';

import type { AnimalAvatarKey } from '@/shared/config/animals';

// 각 동물은 viewBox "0 0 48 48" 기준으로 그려진다.
// animal-avatar.tsx가 <Svg>로 감싸 size에 맞게 스케일한다.
// 굵은 외곽선 없이 면 위주의 플랫 카툰(참고 이미지 톤).

const INK = '#3A322B';

const shapes: Record<AnimalAvatarKey, () => ReactElement> = {
  fox: () => (
    <G>
      <Polygon points="11,9 21,17 12,22" fill="#E07B3D" />
      <Polygon points="37,9 27,17 36,22" fill="#E07B3D" />
      <Polygon points="14,12 19,17 15,20" fill="#FBE7D4" />
      <Polygon points="34,12 29,17 33,20" fill="#FBE7D4" />
      <Path d="M10,19 Q24,13 38,19 Q34,33 24,39 Q14,33 10,19 Z" fill="#E88A4A" />
      <Path d="M17,28 Q24,40 31,28 Q24,33 17,28 Z" fill="#FFF7EE" />
      <Circle cx="19" cy="24" r="1.9" fill={INK} />
      <Circle cx="29" cy="24" r="1.9" fill={INK} />
      <Ellipse cx="24" cy="31" rx="2.1" ry="1.7" fill={INK} />
    </G>
  ),
  panda: () => (
    <G>
      <Circle cx="15" cy="13" r="5.2" fill={INK} />
      <Circle cx="33" cy="13" r="5.2" fill={INK} />
      <Circle cx="24" cy="26" r="14" fill="#FFFDF7" />
      <Ellipse cx="18" cy="24" rx="3.2" ry="4.4" fill={INK} />
      <Ellipse cx="30" cy="24" rx="3.2" ry="4.4" fill={INK} />
      <Circle cx="18.4" cy="23" r="1.2" fill="#FFFDF7" />
      <Circle cx="30.4" cy="23" r="1.2" fill="#FFFDF7" />
      <Ellipse cx="24" cy="31" rx="2.1" ry="1.6" fill={INK} />
      <Path d="M22,33 Q24,35 26,33" stroke={INK} strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </G>
  ),
  elephant: () => (
    <G>
      <Circle cx="12" cy="21" r="8.5" fill="#AFC2D3" />
      <Circle cx="36" cy="21" r="8.5" fill="#AFC2D3" />
      <Circle cx="24" cy="24" r="11.5" fill="#9BB0C4" />
      <Path d="M21.5,26 L26.5,26 Q27.5,36 23.5,41 Q21.5,43 20.5,41 Q22.5,40 22,36 Z" fill="#9BB0C4" />
      <Circle cx="19" cy="22" r="1.7" fill={INK} />
      <Circle cx="29" cy="22" r="1.7" fill={INK} />
    </G>
  ),
  whale: () => (
    <G>
      <Ellipse cx="25" cy="28" rx="14" ry="9.5" fill="#9AA8DD" />
      <Path d="M14,30 Q25,40 37,30 Q25,36 14,30 Z" fill="#C4CDEB" />
      <Polygon points="37,23 45,18 43,28 45,34 37,32" fill="#9AA8DD" />
      <Circle cx="18" cy="26" r="1.7" fill={INK} />
      <Path d="M15,31 Q18,33 21,31" stroke={INK} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <Path d="M18,19 Q14,13 13,9" stroke="#BFD0EC" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <Path d="M18,19 L18,8" stroke="#BFD0EC" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <Path d="M18,19 Q21,13 22,10" stroke="#BFD0EC" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <Circle cx="12.5" cy="7.5" r="1.3" fill="#BFD0EC" />
      <Circle cx="18" cy="6.5" r="1.4" fill="#BFD0EC" />
      <Circle cx="22.5" cy="9" r="1.2" fill="#BFD0EC" />
    </G>
  ),
  rabbit: () => (
    <G>
      <Ellipse cx="18" cy="12" rx="3.4" ry="9.5" fill="#F3EFEA" />
      <Ellipse cx="30" cy="12" rx="3.4" ry="9.5" fill="#F3EFEA" />
      <Ellipse cx="18" cy="12" rx="1.4" ry="6.5" fill="#E9B7C4" />
      <Ellipse cx="30" cy="12" rx="1.4" ry="6.5" fill="#E9B7C4" />
      <Circle cx="24" cy="28" r="11.5" fill="#F3EFEA" />
      <Circle cx="20" cy="26.5" r="1.7" fill={INK} />
      <Circle cx="28" cy="26.5" r="1.7" fill={INK} />
      <Circle cx="17.5" cy="31" r="2.2" fill="#F2D0D9" />
      <Circle cx="30.5" cy="31" r="2.2" fill="#F2D0D9" />
      <Path d="M24,30 L24,32 M22,32.5 Q24,34 26,32.5" stroke="#E98FA5" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="24" cy="30.5" r="1.5" fill="#E98FA5" />
    </G>
  ),
  bear: () => (
    <G>
      <Circle cx="14" cy="15" r="5" fill="#B58C63" />
      <Circle cx="34" cy="15" r="5" fill="#B58C63" />
      <Circle cx="14" cy="15" r="2.4" fill="#CBA57C" />
      <Circle cx="34" cy="15" r="2.4" fill="#CBA57C" />
      <Circle cx="24" cy="27" r="13" fill="#B58C63" />
      <Ellipse cx="24" cy="31" rx="6.2" ry="5" fill="#E6D0AF" />
      <Circle cx="19" cy="24" r="1.8" fill={INK} />
      <Circle cx="29" cy="24" r="1.8" fill={INK} />
      <Ellipse cx="24" cy="28.5" rx="2.1" ry="1.6" fill={INK} />
      <Path d="M24,30 L24,32 Q24,33.5 22.5,33.5 M24,32 Q24,33.5 25.5,33.5" stroke={INK} strokeWidth="1" fill="none" strokeLinecap="round" />
    </G>
  ),
  tiger: () => (
    <G>
      <Circle cx="14" cy="14" r="4.6" fill="#EC9256" />
      <Circle cx="34" cy="14" r="4.6" fill="#EC9256" />
      <Circle cx="14" cy="14" r="2.1" fill="#FBEFE0" />
      <Circle cx="34" cy="14" r="2.1" fill="#FBEFE0" />
      <Circle cx="24" cy="26" r="13" fill="#EC9256" />
      <Ellipse cx="24" cy="31" rx="6.5" ry="5.2" fill="#FBEFE0" />
      <Path d="M13,20 L16,24 M35,20 L32,24 M12,27 L15,28 M36,27 L33,28" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <Circle cx="19" cy="24" r="1.8" fill={INK} />
      <Circle cx="29" cy="24" r="1.8" fill={INK} />
      <Path d="M21.5,29 L26.5,29 L24,31.5 Z" fill="#D6795A" />
      <Path d="M24,31.5 L24,33" stroke={INK} strokeWidth="1" strokeLinecap="round" />
    </G>
  ),
  deer: () => (
    <G>
      <Path d="M17,14 L14,7 M14,10 L10,8 M17,14 L18,8" stroke="#8A6A44" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <Path d="M31,14 L34,7 M34,10 L38,8 M31,14 L30,8" stroke="#8A6A44" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <Ellipse cx="17" cy="18" rx="2.8" ry="4.4" fill="#C99C6D" />
      <Ellipse cx="31" cy="18" rx="2.8" ry="4.4" fill="#C99C6D" />
      <Ellipse cx="17" cy="18.5" rx="1.3" ry="2.6" fill="#EFE0C8" />
      <Ellipse cx="31" cy="18.5" rx="1.3" ry="2.6" fill="#EFE0C8" />
      <Ellipse cx="24" cy="27" rx="8.5" ry="11" fill="#CBA070" />
      <Ellipse cx="24" cy="35" rx="4.4" ry="3.4" fill="#EFE0C8" />
      <Circle cx="20" cy="25" r="1.7" fill={INK} />
      <Circle cx="28" cy="25" r="1.7" fill={INK} />
      <Ellipse cx="24" cy="34" rx="1.8" ry="1.4" fill={INK} />
      <Circle cx="18" cy="30" r="1.1" fill="#EFE0C8" />
      <Circle cx="30" cy="30" r="1.1" fill="#EFE0C8" />
    </G>
  ),
  penguin: () => (
    <G>
      <Ellipse cx="24" cy="26" rx="12.5" ry="14" fill="#41505F" />
      <Path d="M13,24 Q6,29 9,36 Q12,33 15,27 Z" fill="#374553" />
      <Path d="M35,24 Q42,29 39,36 Q36,33 33,27 Z" fill="#374553" />
      <Ellipse cx="24" cy="29" rx="8" ry="11" fill="#FBF6EC" />
      <Circle cx="19.5" cy="20" r="2.2" fill="#FBF6EC" />
      <Circle cx="28.5" cy="20" r="2.2" fill="#FBF6EC" />
      <Circle cx="19.5" cy="20.4" r="1.1" fill={INK} />
      <Circle cx="28.5" cy="20.4" r="1.1" fill={INK} />
      <Polygon points="24,22 21,25 27,25" fill="#E8A23D" />
      <Ellipse cx="19" cy="40" rx="3" ry="1.6" fill="#E8A23D" />
      <Ellipse cx="29" cy="40" rx="3" ry="1.6" fill="#E8A23D" />
    </G>
  ),
  cat: () => (
    <G>
      <Polygon points="12,9 21,17 12,20" fill="#E4A968" />
      <Polygon points="36,9 27,17 36,20" fill="#E4A968" />
      <Polygon points="14,12 19,17 14,18" fill="#F2CDA0" />
      <Polygon points="34,12 29,17 34,18" fill="#F2CDA0" />
      <Circle cx="24" cy="27" r="13" fill="#E4A968" />
      <Circle cx="19" cy="25" r="1.9" fill={INK} />
      <Circle cx="29" cy="25" r="1.9" fill={INK} />
      <Path d="M21.5,30 L26.5,30 L24,32 Z" fill="#D67F6A" />
      <Path d="M24,32 L24,33.5 M24,33.5 Q22,34.5 21,34 M24,33.5 Q26,34.5 27,34" stroke={INK} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <Line x1="9" y1="27" x2="16" y2="28" stroke={INK} strokeWidth="0.8" strokeLinecap="round" />
      <Line x1="9" y1="30" x2="16" y2="30.5" stroke={INK} strokeWidth="0.8" strokeLinecap="round" />
      <Line x1="39" y1="27" x2="32" y2="28" stroke={INK} strokeWidth="0.8" strokeLinecap="round" />
      <Line x1="39" y1="30" x2="32" y2="30.5" stroke={INK} strokeWidth="0.8" strokeLinecap="round" />
    </G>
  ),
};

export const ANIMAL_SHAPES = shapes;
