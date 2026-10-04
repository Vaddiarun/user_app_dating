import { chatApi, uploadToS3, ApiError } from './api'

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_EDGE = 1280

/** Shrinks a photo to at most 1280px on its long edge as a JPEG (~150–300 KB), so it sends fast
 * on mobile data during a call. EXIF orientation is applied by the browser when drawing. */
export async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) throw new ApiError('Please pick a photo.', 0)
  if (file.size > MAX_INPUT_BYTES) throw new ApiError('That photo is too large (max 15 MB).', 0)
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new ApiError('Could not read that photo — try another one.', 0)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new ApiError('Could not prepare that photo — try another one.', 0)
  return blob
}

/** Compress → presign → upload → send. Resolves with the saved message
 * ({ messageId, senderId, type: 'image', mediaUrl, content, createdAt }). */
export async function sendChatImage(recipientId, file) {
  const blob = await compressImage(file)
  let presign
  try {
    presign = await chatApi.imageUploadUrl(recipientId, blob.type)
  } catch (e) {
    if (e?.status === 404) throw new ApiError('Sending photos isn’t switched on yet — coming soon.', 404)
    throw e
  }
  await uploadToS3(presign.uploadUrl, blob, blob.type)
  return chatApi.sendImage(recipientId, presign.mediaKey)
}

/** True when a chat message (API or socket shape) is a photo. */
export const isImageMessage = (m) => m?.type === 'image' || !!m?.mediaUrl
