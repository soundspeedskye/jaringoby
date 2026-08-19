import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type ExpensePhotoSource = 'camera' | 'library';

export type ExpensePhotoPickResult =
  | { status: 'selected'; uri: string }
  | { status: 'cancelled' }
  | { status: 'permission-denied'; source: 'camera' };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  allowsMultipleSelection: false,
  exif: false,
  mediaTypes: ['images'],
  quality: 0.78,
};
const MAX_EXPENSE_PHOTO_EDGE = 1_600;

export async function pickSanitizedExpensePhoto(
  source: ExpensePhotoSource,
): Promise<ExpensePhotoPickResult> {
  // The library uses iOS's out-of-process system picker (PHPickerViewController),
  // which hands back only the chosen asset and needs no media-library permission.
  // Camera capture still requires an explicit grant.
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied', source };
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
    : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };

  // Re-encoding drops the original EXIF block, including GPS metadata.
  const sanitized = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeActions(asset.width, asset.height, MAX_EXPENSE_PHOTO_EDGE),
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return { status: 'selected', uri: sanitized.uri };
}

function resizeActions(
  width: number,
  height: number | undefined,
  maxEdge: number,
): ImageManipulator.Action[] {
  const [nextWidth, nextHeight] = resizeDimensions(width, height ?? width, maxEdge);
  if (nextWidth === width && nextHeight === (height ?? width)) return [];
  return [{ resize: { width: nextWidth, height: nextHeight } }];
}

function resizeDimensions(width: number, height: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}
