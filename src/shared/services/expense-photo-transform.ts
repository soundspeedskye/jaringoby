import * as ImageManipulator from 'expo-image-manipulator';

const MAX_EXPENSE_THUMBNAIL_EDGE = 640;

/** Creates the lightweight rendition used by feed cards without cropping it. */
export async function createExpensePhotoThumbnail(uri: string): Promise<string> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const [width, height] = resizeDimensions(
    original.width,
    original.height,
    MAX_EXPENSE_THUMBNAIL_EDGE,
  );
  context.reset().resize({ width, height });
  const resized = await context.renderAsync();
  const thumbnail = await resized.saveAsync({
    compress: 0.68,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return thumbnail.uri;
}

function resizeDimensions(width: number, height: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}
