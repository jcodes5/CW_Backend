import { v2 as cloudinary } from 'cloudinary'
import { logger } from '@/utils/logger'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

export async function testCloudinaryConnection(): Promise<void> {
  try {
    await cloudinary.api.ping()
    logger.info('✓ Cloudinary connection established')
  } catch {
    logger.warn('⚠ Cloudinary not configured — image uploads will be unavailable')
  }
}

export { cloudinary }
