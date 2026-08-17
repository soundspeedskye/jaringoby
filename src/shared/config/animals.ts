// 프로필 기본 아이콘: 손글씨 종이 톤과 조화되는 플랫 카툰 동물 10종.
// avatar 필드에는 아래 키 문자열이 저장/전달된다(id 해시로 배정).
// 렌더는 src/components/avatar/animal-avatar.tsx 참고.

export const ANIMAL_AVATARS = [
  'fox',
  'panda',
  'elephant',
  'whale',
  'rabbit',
  'bear',
  'tiger',
  'deer',
  'penguin',
  'cat',
] as const;

export type AnimalAvatarKey = (typeof ANIMAL_AVATARS)[number];

const ANIMAL_SET = new Set<string>(ANIMAL_AVATARS);

/** FNV-1a 32bit. supabase-repository의 hash32와 동일 계열(문자열 → 안정 해시). */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * avatar 값을 동물 키로 정규화한다.
 * - 유효한 동물 키면 그대로 사용.
 * - 레거시 이모지나 알 수 없는 값이면 값 해시로 안정적으로 하나를 고른다(빈 값 → 첫 키).
 */
export function resolveAnimal(value: string | undefined | null): AnimalAvatarKey {
  if (value && ANIMAL_SET.has(value)) return value as AnimalAvatarKey;
  if (!value) return ANIMAL_AVATARS[0];
  return ANIMAL_AVATARS[hash32(value) % ANIMAL_AVATARS.length];
}

/** 동물별 종이 파스텔 배경색(원형 칩 바탕). palette와 조화되는 차분한 채도. */
export const ANIMAL_BACKGROUNDS: Record<AnimalAvatarKey, string> = {
  fox: '#FBE7D4',
  panda: '#E7ECE5',
  elephant: '#E4EBF2',
  whale: '#ECE7F5',
  rabbit: '#F6E7ED',
  bear: '#F2E7D3',
  tiger: '#FBE6D0',
  deer: '#F1E6D1',
  penguin: '#E2ECEF',
  cat: '#F7EBD7',
};
