import { File as ExpoFile } from 'expo-file-system';

import { RepositoryError } from './errors';

/** Storage에 올릴 사진을 읽고 형식을 정규화한다. */

export async function readPhoto(uri: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
  extension: string;
}> {
  let buffer: ArrayBuffer;
  let detectedType = '';
  try {
    if (/^(file|content):/u.test(uri)) {
      const file = new ExpoFile(uri);
      buffer = await file.arrayBuffer();
      detectedType = file.type;
    } else {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`photo read failed (${response.status})`);
      detectedType = response.headers.get('content-type')?.split(';')[0] ?? '';
      buffer = await response.arrayBuffer();
    }
  } catch (error) {
    throw new RepositoryError('PHOTO_READ_FAILED', '선택한 사진 파일을 읽지 못했어요.', { cause: error });
  }

  const uriExtension = /\.([a-z0-9]+)(?:[?#]|$)/iu.exec(uri)?.[1]?.toLowerCase();
  const contentType = normalizeImageType(detectedType, uriExtension);
  const extension = extensionForContentType(contentType);
  return { buffer, contentType, extension };
}

export function normalizeImageType(type: string, extension?: string): string {
  const normalized = type.toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(normalized)) {
    return normalized;
  }
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  throw new RepositoryError('PHOTO_TYPE_NOT_ALLOWED', 'JPEG, PNG, WebP, HEIC 사진만 올릴 수 있어요.');
}

export function extensionForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  return contentType.slice('image/'.length);
}

export function safeObjectStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 120);
}
