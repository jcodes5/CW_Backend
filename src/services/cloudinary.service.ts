import { v2 as cloudinary } from 'cloudinary'
import { logger } from '@/utils/logger'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

const FOLDER = process.env.CLOUDINARY_FOLDER ?? 'craftworldcentre'

export interface UploadResult {
  publicId: string
  url:      string
  width:    number
  height:   number
  format:   string
}

// ── Upload from buffer (after multer) ────────────────────────
export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:          `${FOLDER}/${folder}`,
        public_id:       publicId,
        resource_type:   'image',
        quality:         'auto:good',
        fetch_format:    'auto',
        transformation:  [{ width: 1200, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'))
        resolve({
          publicId: result.public_id,
          url:      result.secure_url,
          width:    result.width,
          height:   result.height,
          format:   result.format,
        })
      }
    )
    uploadStream.end(buffer)
  })
}

// ── Upload multiple buffers ───────────────────────────────────
export async function uploadMultiple(
  buffers: Buffer[],
  folder: string
): Promise<UploadResult[]> {
  return Promise.all(buffers.map((buf) => uploadBuffer(buf, folder)))
}

// ── Delete by public ID ───────────────────────────────────────
export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId)
    logger.info(`Cloudinary: deleted ${publicId}`)
  } catch (err) {
    logger.error(`Cloudinary: failed to delete ${publicId}`, err)
  }
}

// ── Delete multiple ───────────────────────────────────────────
export async function deleteImages(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.map(deleteImage))
}

// ── Generate thumbnail URL ────────────────────────────────────
export function getThumbnailUrl(publicId: string, width = 400): string {
  return cloudinary.url(publicId, {
    width,
    crop:         'fill',
    quality:      'auto:good',
    fetch_format: 'auto',
    secure:       true,
  })
}

export const cloudinaryService = {
  uploadBuffer,
  uploadMultiple,
  deleteImage,
  deleteImages,
  getThumbnailUrl,
}
