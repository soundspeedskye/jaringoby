import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type ProfilePhotoSource = 'camera' | 'library';

export type ProfilePhotoPickResult =
  | { status: 'selected'; uri: string }
  | { status: 'cancelled' }
  | { status: 'permission-denied'; source: 'camera' };

const MAX_PROFILE_PHOTO_WIDTH = 1_024;

/**
 * A square, re-encoded JPEG is safer to render and drops EXIF (including GPS).
 * Storage performs the final 5 MB binary limit check before uploading.
 */
export async function pickSanitizedProfilePhoto(
  source: ProfilePhotoSource,
): Promise<ProfilePhotoPickResult> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied', source };
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        exif: false,
        mediaTypes: ['images'],
        quality: 0.9,
      })
    : await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        exif: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };

  const sanitized = await ImageManipulator.manipulateAsync(
    asset.uri,
    asset.width > MAX_PROFILE_PHOTO_WIDTH || asset.height > MAX_PROFILE_PHOTO_WIDTH
      ? [{ resize: asset.width >= asset.height
        ? { width: MAX_PROFILE_PHOTO_WIDTH }
        : { height: MAX_PROFILE_PHOTO_WIDTH } }]
      : [],
    { compress: 0.84, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { status: 'selected', uri: sanitized.uri };
}
