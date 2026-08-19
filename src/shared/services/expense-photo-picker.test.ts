import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pickSanitizedExpensePhoto } from '@/shared/services/expense-photo-picker';
import { createExpensePhotoThumbnail } from '@/shared/services/expense-photo-transform';

const mocks = vi.hoisted(() => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  manipulateAsync: vi.fn(),
  manipulate: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock('expo-image-picker', () => ({
  launchCameraAsync: mocks.launchCameraAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestCameraPermissionsAsync: mocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
}));

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: mocks.manipulateAsync,
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('pickSanitizedExpensePhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.manipulateAsync.mockResolvedValue({ uri: 'file:///sanitized.jpg' });
  });

  it('returns permission-denied without opening the picker', async () => {
    mocks.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(pickSanitizedExpensePhoto('camera')).resolves.toEqual({
      status: 'permission-denied',
      source: 'camera',
    });
    expect(mocks.launchCameraAsync).not.toHaveBeenCalled();
    expect(mocks.manipulateAsync).not.toHaveBeenCalled();
  });

  it('opens the library picker without requesting media-library permission', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///small.png', width: 1_200 }],
    });

    await expect(pickSanitizedExpensePhoto('library')).resolves.toEqual({
      status: 'selected',
      uri: 'file:///sanitized.jpg',
    });
    expect(mocks.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.launchImageLibraryAsync).toHaveBeenCalled();
  });

  it('returns cancelled without trying to sanitize an asset', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: null,
    });

    await expect(pickSanitizedExpensePhoto('library')).resolves.toEqual({
      status: 'cancelled',
    });
    expect(mocks.manipulateAsync).not.toHaveBeenCalled();
  });

  it('resizes an oversized photo and re-encodes it as JPEG', async () => {
    mocks.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///large.heic', width: 2_400 }],
    });

    await expect(pickSanitizedExpensePhoto('camera')).resolves.toEqual({
      status: 'selected',
      uri: 'file:///sanitized.jpg',
    });
    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///large.heic',
      [{ resize: { width: 1_600, height: 1_600 } }],
      { compress: 0.8, format: 'jpeg' },
    );
  });

  it('still re-encodes a small photo without resizing it', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///small.png', width: 1_200 }],
    });

    await expect(pickSanitizedExpensePhoto('library')).resolves.toEqual({
      status: 'selected',
      uri: 'file:///sanitized.jpg',
    });
    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///small.png',
      [],
      { compress: 0.8, format: 'jpeg' },
    );
  });

  it('세로 사진도 긴 변 기준으로 원본 크기를 제한한다', async () => {
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///portrait.jpg', width: 1_080, height: 2_160 }],
    });

    await pickSanitizedExpensePhoto('library');

    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///portrait.jpg',
      [{ resize: { width: 800, height: 1_600 } }],
      { compress: 0.8, format: 'jpeg' },
    );
  });

  it('목록용 썸네일은 긴 변을 640px으로 축소한다', async () => {
    const context = {
      renderAsync: vi.fn()
        .mockResolvedValueOnce({ width: 1_600, height: 800 })
        .mockResolvedValueOnce({
          saveAsync: vi.fn().mockResolvedValue({ uri: 'file:///thumbnail.jpg' }),
        }),
      reset: vi.fn(),
      resize: vi.fn(),
    };
    context.reset.mockReturnValue(context);
    context.resize.mockReturnValue(context);
    mocks.manipulate.mockReturnValue(context);

    await expect(createExpensePhotoThumbnail('file:///sanitized.jpg')).resolves.toBe(
      'file:///thumbnail.jpg',
    );
    expect(context.resize).toHaveBeenCalledWith({ width: 640, height: 320 });
    expect(context.renderAsync).toHaveBeenCalledTimes(2);
  });
});
