import { Image } from 'expo-image';
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg from 'react-native-svg';

import { ANIMAL_BACKGROUNDS, resolveAnimal } from '@/constants/animals';
import { palette } from '@/constants/design';

import { ANIMAL_SHAPES } from './animal-shapes';

type Props = {
  /** 동물 키(예: 'fox'). 레거시 이모지/알 수 없는 값도 안전하게 폴백된다. */
  value: string | undefined | null;
  /** 원형 칩의 지름(px). */
  size: number;
  /** 업로드된 프로필 사진(있으면 동물 대신 사진을 렌더). */
  photoUri?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * 프로필 기본 아이콘. 동물 SVG를 종이 파스텔 원형 칩 위에 렌더한다.
 * photoUri가 있으면 사진을 우선한다(향후 업로드 기능 대비).
 */
function AnimalAvatarBase({ value, size, photoUri, style }: Props) {
  const chip: StyleProp<ViewStyle> = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (photoUri) {
    return (
      <View style={[chip, { backgroundColor: palette.rule }, style]}>
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size }}
          contentFit="cover"
        />
      </View>
    );
  }

  const animal = resolveAnimal(value);
  const Shape = ANIMAL_SHAPES[animal];

  return (
    <View style={[chip, { backgroundColor: ANIMAL_BACKGROUNDS[animal] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Shape />
      </Svg>
    </View>
  );
}

export const AnimalAvatar = memo(AnimalAvatarBase);
