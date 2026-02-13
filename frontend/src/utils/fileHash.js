/**
 * File Hash Utility
 * 
 * Generates MD5 hash of file content for duplicate detection.
 * Uses SparkMD5 for efficient chunked hashing of large files.
 */
import SparkMD5 from 'spark-md5';

/**
 * Calculate MD5 hash of a file using chunked reading
 * This is efficient and doesn't block the UI even for large files
 * 
 * @param {File} file - The file to hash
 * @param {Function} onProgress - Optional progress callback (0-100)
 * @returns {Promise<string>} - The MD5 hash as hex string
 */
export const calculateFileHash = (file, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const chunkSize = 2097152; // 2MB chunks for optimal performance
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      spark.append(e.target.result);
      currentChunk++;

      if (onProgress) {
        onProgress(Math.round((currentChunk / chunks) * 100));
      }

      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error('Failed to read file for hashing'));
    };

    const loadNext = () => {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      fileReader.readAsArrayBuffer(file.slice(start, end));
    };

    loadNext();
  });
};

/**
 * Calculate hashes for multiple files in parallel
 * 
 * @param {File[]} files - Array of files to hash
 * @param {Function} onFileProgress - Callback for individual file progress
 * @returns {Promise<Map<File, string>>} - Map of file to hash
 */
export const calculateMultipleFileHashes = async (files, onFileProgress = null) => {
  const results = new Map();
  
  // Process files in parallel batches of 3 to avoid overwhelming the browser
  const batchSize = 3;
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (file, batchIndex) => {
      const fileIndex = i + batchIndex;
      try {
        const hash = await calculateFileHash(file, (progress) => {
          if (onFileProgress) {
            onFileProgress(fileIndex, file.name, progress);
          }
        });
        results.set(file, hash);
      } catch (error) {
        console.error(`Failed to hash ${file.name}:`, error);
        results.set(file, null);
      }
    }));
  }
  
  return results;
};

/**
 * Quick hash for small files (under 1MB)
 * Uses the entire file content for maximum accuracy
 * 
 * @param {File} file - The file to hash
 * @returns {Promise<string>} - The MD5 hash
 */
export const quickHash = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const spark = new SparkMD5.ArrayBuffer();
      spark.append(e.target.result);
      resolve(spark.end());
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

export default calculateFileHash;
