import { Image } from 'expo-image';
import { useState } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';

type ExpensePhotoProps = {
  accessibilityLabel: string;
  photoPath?: string;
  photoThumbnailUri?: string;
  photoUri?: string;
  style: StyleProp<ImageStyle>;
  variant: 'thumbnail' | 'detail';
};

/** Keeps feed-sized assets small while retaining a safe fallback for old photos. */
export function ExpensePhoto({
  accessibilityLabel,
  photoPath,
  photoThumbnailUri,
  photoUri,
  style,
  variant,
}: ExpensePhotoProps) {
  const [failedThumbnailUri, setFailedThumbnailUri] = useState<string>();

  const useThumbnail = variant === 'thumbnail' && Boolean(photoThumbnailUri) && failedThumbnailUri !== photoThumbnailUri;
  const uri = useThumbnail ? photoThumbnailUri : photoUri;
  const cacheKey = `${useThumbnail ? 'thumbnail' : 'detail'}:${photoPath ?? uri ?? accessibilityLabel}`;

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      cachePolicy="memory-disk"
      contentFit={variant === 'thumbnail' ? 'cover' : 'contain'}
      onError={useThumbnail ? () => setFailedThumbnailUri(photoThumbnailUri) : undefined}
      source={{ uri, cacheKey }}
      style={style}
    />
  );
}
