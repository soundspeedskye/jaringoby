import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pickSanitizedExpensePhoto } from '@/services/expense-photo-picker';

const mocks = vi.hoisted(() => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  manipulateAsync: vi.fn(),
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
      [{ resize: { width: 1_600 } }],
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
});
