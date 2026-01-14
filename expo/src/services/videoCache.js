import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIDEO_CACHE_DIR = FileSystem.cacheDirectory + 'video_circles/';
const CACHE_INDEX_KEY = '@video_circle_cache_index';

// Инициализация директории кэша
const ensureCacheDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
  }
};

// Генерация имени файла из URL
const getFilenameFromUrl = (url) => {
  const hash = url.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  const ext = url.split('.').pop()?.split('?')[0] || 'mp4';
  return `vc_${Math.abs(hash)}.${ext}`;
};

// Получение локального пути для URL
const getLocalPath = (url) => {
  return VIDEO_CACHE_DIR + getFilenameFromUrl(url);
};

// Загрузка индекса кэша
const loadCacheIndex = async () => {
  try {
    const data = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

// Сохранение индекса кэша
const saveCacheIndex = async (index) => {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('Ошибка сохранения индекса кэша:', error);
  }
};

/**
 * Получить видео из кэша или загрузить
 * @param {string} remoteUrl - URL видео на сервере
 * @returns {Promise<string>} - Локальный URI видео
 */
export const getCachedVideo = async (remoteUrl) => {
  if (!remoteUrl) return null;
  
  try {
    await ensureCacheDir();
    
    const localPath = getLocalPath(remoteUrl);
    const cacheIndex = await loadCacheIndex();
    
    // Проверяем есть ли в кэше
    if (cacheIndex[remoteUrl]) {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        // console.log('📦 Видео из кэша:', localPath);
        return localPath;
      }
    }
    
    // Загружаем и кэшируем
    // console.log('⬇️ Загрузка видео:', remoteUrl);
    
    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
    
    if (downloadResult.status === 200) {
      // Обновляем индекс
      cacheIndex[remoteUrl] = {
        localPath,
        cachedAt: Date.now(),
        size: downloadResult.headers['content-length'] || 0,
      };
      await saveCacheIndex(cacheIndex);
      
      // console.log('✅ Видео закэшировано:', localPath);
      return localPath;
    }
    
    // Если не удалось загрузить - возвращаем оригинальный URL
    return remoteUrl;
  } catch (error) {
    console.error('Ошибка кэширования видео:', error);
    return remoteUrl;
  }
};

/**
 * Проверить есть ли видео в кэше (синхронная проверка по индексу)
 */
export const isVideoCached = async (remoteUrl) => {
  try {
    const cacheIndex = await loadCacheIndex();
    if (!cacheIndex[remoteUrl]) return false;
    
    const localPath = getLocalPath(remoteUrl);
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    return fileInfo.exists;
  } catch {
    return false;
  }
};

/**
 * Предзагрузка видео в фоне (не блокирует UI)
 */
export const preloadVideo = (remoteUrl) => {
  // Запускаем в фоне без await
  getCachedVideo(remoteUrl).catch(() => {});
};

/**
 * Предзагрузка нескольких видео
 */
export const preloadVideos = (urls) => {
  urls.forEach(url => {
    if (url) preloadVideo(url);
  });
};

/**
 * Очистка старого кэша (старше 7 дней)
 */
export const cleanOldCache = async () => {
  try {
    const cacheIndex = await loadCacheIndex();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
    
    let cleaned = 0;
    const newIndex = {};
    
    for (const [url, data] of Object.entries(cacheIndex)) {
      if (now - data.cachedAt > maxAge) {
        // Удаляем старый файл
        try {
          await FileSystem.deleteAsync(data.localPath, { idempotent: true });
          cleaned++;
        } catch {}
      } else {
        newIndex[url] = data;
      }
    }
    
    await saveCacheIndex(newIndex);
    
    if (cleaned > 0) {
      console.log(`🧹 Очищено ${cleaned} старых видео из кэша`);
    }
  } catch (error) {
    console.error('Ошибка очистки кэша:', error);
  }
};

/**
 * Полная очистка кэша видеокружков
 */
export const clearVideoCache = async () => {
  try {
    await FileSystem.deleteAsync(VIDEO_CACHE_DIR, { idempotent: true });
    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
    console.log('🗑️ Кэш видеокружков очищен');
  } catch (error) {
    console.error('Ошибка очистки кэша:', error);
  }
};

/**
 * Получить размер кэша
 */
export const getCacheSize = async () => {
  try {
    const cacheIndex = await loadCacheIndex();
    let totalSize = 0;
    
    for (const data of Object.values(cacheIndex)) {
      const fileInfo = await FileSystem.getInfoAsync(data.localPath);
      if (fileInfo.exists && fileInfo.size) {
        totalSize += fileInfo.size;
      }
    }
    
    return totalSize;
  } catch {
    return 0;
  }
};

/**
 * Форматирование размера
 */
export const formatCacheSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default {
  getCachedVideo,
  isVideoCached,
  preloadVideo,
  preloadVideos,
  cleanOldCache,
  clearVideoCache,
  getCacheSize,
  formatCacheSize,
};
