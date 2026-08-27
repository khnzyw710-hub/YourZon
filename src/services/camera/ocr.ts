import TextRecognition from '@react-native-ml-kit/text-recognition';

export interface OCRResult {
  text: string;
  blocks: Array<{ text: string; confidence: number }>;
}

export async function recognizeText(imageUriOrBase64: string): Promise<OCRResult> {
  try {
    // ML Kit accepts file URIs; for base64 we create a data URI
    const uri = imageUriOrBase64.startsWith('data:') || imageUriOrBase64.startsWith('file:')
      ? imageUriOrBase64
      : `data:image/jpeg;base64,${imageUriOrBase64}`;

    const result = await TextRecognition.recognize(uri);

    return {
      text: result.text ?? '',
      blocks: (result.blocks ?? []).map((b: any) => ({
        text: b.text ?? '',
        confidence: b.confidence ?? 1,
      })),
    };
  } catch {
    return { text: '', blocks: [] };
  }
}

export function hasSignificantText(result: OCRResult): boolean {
  return result.text.trim().length > 5;
}

export function buildOCRContextPrompt(ocrText: string, userQuery: string): string {
  return `The camera captured the following text:\n"${ocrText}"\n\nUser question: ${userQuery}`;
}
