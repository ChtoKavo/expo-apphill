/**
 * Универсальный сервис кэширования медиафайлов
 * Поддержка: изображения, видео, голосовые сообщения
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Правильный IP сервера
const CORRECT_SERVER_IP = '151.247.196.66:3001';

// Неправильные IP которые сервер иногда возвращает
const WRONG_IPS = [
  '151.241.228.247:3001',
];

// Исправление URL с неправильным IP
const fixMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  
  for (const wrongIp of WRONG_IPS) {
    if (url.includes(wrongIp)) {
      const fixedUrl = url.replace(wrongIp, CORRECT_SERVER_IP);
      console.log('🔧 Исправлен URL:', wrongIp, '→', CORRECT_SERVER_IP);
      return fixedUrl;
    }
  }
  return url;
};

// Директории для разных типов медиа
// Используем documentDirectory для надёжного хранения (не очищается системой)
const CACHE_DIRS = {
  image: FileSystem.documentDirectory + 'media_cache/images/',
  video: FileSystem.documentDirectory + 'media_cache/videos/',
  video_circle: FileSystem.documentDirectory + 'media_cache/video_circles/',
  voice: FileSystem.documentDirectory + 'media_cache/voice/',
};

const CACHE_INDEX_KEY = '@media_cache_index';

// Максимальный размер кэша в байтах (500MB)
const MAX_CACHE_SIZE = 500 * 1024 * 1024;

// Максимальный возраст файлов в днях
const MAX_AGE_DAYS = {
  image: 30,    // Изображения хранятся месяц
  video: 7,     // Видео - неделю
  video_circle: 7,
  voice: 14,    // Голосовые - 2 недели
};

// Инициализация директорий кэша
const ensureCacheDirs = async () => {
  for (const dir of Object.values(CACHE_DIRS)) {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
};

// Генерация уникального имени файла из URL
const getFilenameFromUrl = (url, type) => {
  // Извлекаем имя файла из URL (например: media-1768229475168-758579502.mp4)
  const urlParts = url.split('/');
  const originalFilename = urlParts[urlParts.length - 1]?.split('?')[0];
  
  // Если есть оригинальное имя файла - используем его
  if (originalFilename && originalFilename.includes('.')) {
    // Добавляем префикс типа для уникальности
    return `${type}_${originalFilename}`;
  }
  
  // Фоллбэк на хеш если не удалось извлечь имя
  const hash = url.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  // Определяем расширение
  let ext = 'dat';
  if (type === 'image') {
    const urlExt = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExt) ? urlExt : 'jpg';
  } else if (type === 'video' || type === 'video_circle') {
    ext = 'mp4';
  } else if (type === 'voice') {
    const urlExt = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    ext = ['m4a', 'mp3', 'aac', 'wav'].includes(urlExt) ? urlExt : 'm4a';
  }
  
  return `${type}_${Math.abs(hash)}.${ext}`;
};

// Получение локального пути для URL
const getLocalPath = (url, type) => {
  const dir = CACHE_DIRS[type] || CACHE_DIRS.image;
  return dir + getFilenameFromUrl(url, type);
};

// Загрузка индекса кэша
let lastLogTime = 0;
const loadCacheIndex = async () => {
  try {
    const data = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const index = data ? JSON.parse(data) : {};
    // Логируем не чаще раза в 5 секунд
    const now = Date.now();
    if (now - lastLogTime > 5000) {
      console.log(`📋 Индекс кэша: ${Object.keys(index).length} записей`);
      lastLogTime = now;
    }
    return index;
  } catch (err) {
    console.error('Ошибка загрузки индекса кэша:', err);
    return {};
  }
};

// Сохранение индекса кэша
const saveCacheIndex = async (index) => {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    console.log(`💾 Сохранён индекс кэша: ${Object.keys(index).length} записей`);
  } catch (error) {
    console.error('Ошибка сохранения индекса кэша:', error);
  }
};

// Храним активные загрузки чтобы не запускать дубликаты
// Формат: { promise, timestamp }
const activeDownloads = new Map();

// Очистка старых загрузок (если зависли)
const cleanupStaleDownloads = () => {
  const now = Date.now();
  const STALE_TIMEOUT = 60000; // 60 секунд
  
  for (const [url, entry] of activeDownloads.entries()) {
    if (now - entry.timestamp > STALE_TIMEOUT) {
      console.log(`🧹 Удаляю зависшую загрузку:`, url.slice(-40));
      activeDownloads.delete(url);
    }
  }
};

/**
 * Получить медиафайл из кэша или загрузить
 * @param {string} remoteUrl - URL файла на сервере
 * @param {string} type - Тип медиа: 'image' | 'video' | 'video_circle' | 'voice'
 * @returns {Promise<string>} - Локальный URI файла
 */
export const getCachedMedia = async (remoteUrl, type = 'image') => {
  if (!remoteUrl) return null;
  
  // Очищаем зависшие загрузки
  cleanupStaleDownloads();
  
  // Исправляем URL с неправильным IP
  const fixedUrl = fixMediaUrl(remoteUrl);
  
  // Проверяем что URL валидный
  if (typeof fixedUrl !== 'string' || !fixedUrl.startsWith('http')) {
    console.warn('getCachedMedia: invalid URL', fixedUrl);
    return fixedUrl; // Возвращаем как есть
  }
  
  // Если уже загружается этот URL - ждём завершения (не более 30 сек)
  if (activeDownloads.has(fixedUrl)) {
    const entry = activeDownloads.get(fixedUrl);
    const waitTime = Date.now() - entry.timestamp;
    
    if (waitTime < 30000) {
      console.log(`⏳ Ожидаю загрузку [${type}] (${Math.round(waitTime/1000)}с):`, fixedUrl.slice(-40));
      return entry.promise;
    } else {
      // Загрузка висит слишком долго - удаляем и начинаем заново
      console.log(`⚠️ Загрузка зависла, перезапускаю:`, fixedUrl.slice(-40));
      activeDownloads.delete(fixedUrl);
    }
  }
  
  try {
    await ensureCacheDirs();
    
    const localPath = getLocalPath(fixedUrl, type);
    const cacheIndex = await loadCacheIndex();
    
    // Логируем для отладки
    const urlKey = fixedUrl.slice(-50);
    console.log(`🔍 Ищу в кэше [${type}]: ...${urlKey}`);
    
    // Проверяем есть ли в кэше (проверяем оба URL - оригинальный и исправленный)
    const cachedEntry = cacheIndex[fixedUrl] || cacheIndex[remoteUrl];
    if (cachedEntry) {
      console.log(`🔍 Найдена запись в индексе: ${cachedEntry.localPath?.slice(-40)}`);
      // Используем путь из кэша, так как он мог быть сохранён с другим URL
      const cachedPath = cachedEntry.localPath || localPath;
      const fileInfo = await FileSystem.getInfoAsync(cachedPath);
      console.log(`🔍 Проверка файла ${cachedPath.slice(-40)}: exists=${fileInfo.exists}`);
      if (fileInfo.exists) {
        // Обновляем время последнего доступа и нормализуем ключ
        cacheIndex[fixedUrl] = { ...cachedEntry, localPath: cachedPath, lastAccess: Date.now() };
        // Удаляем старый ключ с неправильным IP если он есть
        if (cacheIndex[remoteUrl] && remoteUrl !== fixedUrl) {
          delete cacheIndex[remoteUrl];
        }
        saveCacheIndex(cacheIndex); // Не ждём, сохраняем в фоне
        console.log(`📦 КЭШ HIT [${type}]:`, fixedUrl.slice(-40));
        return cachedPath;
      } else {
        console.log(`⚠️ Файл не существует, удаляю из индекса`);
        delete cacheIndex[fixedUrl];
        if (remoteUrl !== fixedUrl) delete cacheIndex[remoteUrl];
      }
    } else {
      console.log(`🔍 Запись НЕ найдена в индексе`);
    }
    
    console.log(`⬇️ КЭШ MISS [${type}]: загружаю...`, fixedUrl.slice(-40));
    
    // Создаём promise для загрузки и сохраняем в activeDownloads
    const downloadPromise = (async () => {
      try {
        const startTime = Date.now();
        const downloadResult = await FileSystem.downloadAsync(fixedUrl, localPath);
        const downloadTime = Date.now() - startTime;
        
        if (downloadResult.status === 200) {
          // Получаем размер файла
          const fileInfo = await FileSystem.getInfoAsync(localPath);
          const sizeMB = ((fileInfo.size || 0) / 1024 / 1024).toFixed(2);
          
          console.log(`✅ Загружено [${type}]: ${sizeMB} MB за ${downloadTime}ms`, fixedUrl.slice(-40));
          
          // Обновляем индекс
          const freshIndex = await loadCacheIndex();
          freshIndex[fixedUrl] = {
            localPath,
            type,
            cachedAt: Date.now(),
            lastAccess: Date.now(),
            size: fileInfo.size || 0,
          };
          await saveCacheIndex(freshIndex);
          
          return localPath;
        } else {
          console.error(`❌ Ошибка загрузки [${type}]: status=${downloadResult.status}`, fixedUrl.slice(-40));
          return fixedUrl;
        }
      } catch (downloadError) {
        console.error(`❌ Ошибка загрузки [${type}]:`, downloadError.message);
        return fixedUrl;
      } finally {
        // Удаляем из активных загрузок
        activeDownloads.delete(fixedUrl);
      }
    })();
    
    // Сохраняем promise с timestamp в Map
    activeDownloads.set(fixedUrl, { promise: downloadPromise, timestamp: Date.now() });
    
    return downloadPromise;
  } catch (error) {
    console.error(`Ошибка кэширования ${type}:`, error);
    activeDownloads.delete(fixedUrl);
    return fixMediaUrl(remoteUrl); // Возвращаем хотя бы исправленный URL
  }
};

/**
 * Быстрая проверка кэша (не загружает если нет)
 * @returns {Promise<string|null>} - Локальный путь или null
 */
export const checkCache = async (remoteUrl, type = 'image') => {
  if (!remoteUrl) return null;
  
  try {
    const cacheIndex = await loadCacheIndex();
    if (!cacheIndex[remoteUrl]) return null;
    
    const localPath = getLocalPath(remoteUrl, type);
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    
    if (fileInfo.exists) {
      return localPath;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Предзагрузка медиафайла в фоне
 */
export const preloadMedia = (remoteUrl, type = 'image') => {
  if (!remoteUrl) return;
  getCachedMedia(fixMediaUrl(remoteUrl), type).catch(() => {});
};

/**
 * Экспорт функции исправления URL для использования в других компонентах
 */
export { fixMediaUrl };

/**
 * Сохранить локальный файл в кэш с привязкой к серверному URL
 * Используется после записи/загрузки файла чтобы не скачивать его заново
 * @param {string} localUri - Локальный URI файла (file:// или content://)
 * @param {string} serverUrl - URL файла на сервере
 * @param {string} type - Тип медиа: 'image' | 'video' | 'video_circle' | 'voice'
 */
export const cacheLocalFile = async (localUri, serverUrl, type = 'video_circle') => {
  if (!localUri || !serverUrl) return null;
  
  console.log(`📦 cacheLocalFile: сохраняю локальный файл в кэш`);
  console.log(`   localUri: ${localUri.slice(-50)}`);
  console.log(`   serverUrl: ${serverUrl.slice(-50)}`);
  
  try {
    await ensureCacheDirs();
    
    const fixedServerUrl = fixMediaUrl(serverUrl);
    const localPath = getLocalPath(fixedServerUrl, type);
    
    console.log(`   fixedServerUrl: ${fixedServerUrl.slice(-50)}`);
    console.log(`   localPath: ${localPath.slice(-50)}`);
    
    // Проверяем существование исходного файла
    const sourceInfo = await FileSystem.getInfoAsync(localUri);
    if (!sourceInfo.exists) {
      console.error('cacheLocalFile: source file not found:', localUri);
      return null;
    }
    
    // Копируем файл в кэш
    await FileSystem.copyAsync({
      from: localUri,
      to: localPath,
    });
    
    // Получаем размер скопированного файла
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    const sizeMB = ((fileInfo.size || 0) / 1024 / 1024).toFixed(2);
    
    console.log(`📦 Локальный файл сохранён в кэш [${type}]: ${sizeMB} MB`);
    
    // Обновляем индекс кэша
    const cacheIndex = await loadCacheIndex();
    cacheIndex[fixedServerUrl] = {
      localPath,
      type,
      cachedAt: Date.now(),
      lastAccess: Date.now(),
      size: fileInfo.size || 0,
    };
    await saveCacheIndex(cacheIndex);
    
    return localPath;
  } catch (error) {
    console.error('Ошибка сохранения локального файла в кэш:', error);
    return null;
  }
};

/**
 * Предзагрузка нескольких файлов с указанием типа
 * @param {Array<{url: string, type: string}>} items
 */
export const preloadMediaItems = (items) => {
  items.forEach(item => {
    if (item?.url) {
      preloadMedia(item.url, item.type || 'image');
    }
  });
};

/**
 * Предзагрузка списка URL одного типа
 */
export const preloadMediaList = (urls, type = 'image') => {
  urls.forEach(url => {
    if (url) preloadMedia(url, type);
  });
};

/**
 * Получить статистику кэша
 */
export const getCacheStats = async () => {
  try {
    const cacheIndex = await loadCacheIndex();
    const entries = Object.values(cacheIndex);
    
    const stats = {
      totalItems: entries.length,
      totalSize: 0,
      byType: {
        image: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        video_circle: { count: 0, size: 0 },
        voice: { count: 0, size: 0 },
      },
    };
    
    entries.forEach(entry => {
      const size = entry.size || 0;
      stats.totalSize += size;
      
      if (stats.byType[entry.type]) {
        stats.byType[entry.type].count++;
        stats.byType[entry.type].size += size;
      }
    });
    
    return stats;
  } catch {
    return null;
  }
};

/**
 * Очистка старого кэша
 */
export const cleanOldCache = async () => {
  try {
    await ensureCacheDirs();
    const cacheIndex = await loadCacheIndex();
    const now = Date.now();
    
    let cleaned = 0;
    let freedBytes = 0;
    const newIndex = {};
    
    for (const [url, data] of Object.entries(cacheIndex)) {
      const maxAge = (MAX_AGE_DAYS[data.type] || 7) * 24 * 60 * 60 * 1000;
      
      // Используем lastAccess если есть, иначе cachedAt
      const lastUsed = data.lastAccess || data.cachedAt;
      
      if (now - lastUsed > maxAge) {
        // Удаляем старый файл
        try {
          await FileSystem.deleteAsync(data.localPath, { idempotent: true });
          cleaned++;
          freedBytes += data.size || 0;
        } catch {}
      } else {
        newIndex[url] = data;
      }
    }
    
    if (cleaned > 0) {
      await saveCacheIndex(newIndex);
      console.log(`🧹 Очищено ${cleaned} старых медиафайлов (${(freedBytes / 1024 / 1024).toFixed(1)} MB)`);
    }
    
    return { cleaned, freedBytes };
  } catch (error) {
    console.error('Ошибка очистки кэша:', error);
    return { cleaned: 0, freedBytes: 0 };
  }
};

/**
 * Умная очистка при превышении лимита размера кэша
 * Удаляет наименее используемые файлы
 */
export const cleanCacheIfNeeded = async () => {
  try {
    const stats = await getCacheStats();
    if (!stats || stats.totalSize < MAX_CACHE_SIZE) return;
    
    console.log(`⚠️ Кэш превышает лимит: ${(stats.totalSize / 1024 / 1024).toFixed(1)} MB / ${MAX_CACHE_SIZE / 1024 / 1024} MB`);
    
    const cacheIndex = await loadCacheIndex();
    const entries = Object.entries(cacheIndex);
    
    // Сортируем по времени последнего доступа (старые первыми)
    entries.sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
    
    let currentSize = stats.totalSize;
    const targetSize = MAX_CACHE_SIZE * 0.7; // Очищаем до 70% лимита
    let cleaned = 0;
    
    for (const [url, data] of entries) {
      if (currentSize <= targetSize) break;
      
      try {
        await FileSystem.deleteAsync(data.localPath, { idempotent: true });
        delete cacheIndex[url];
        currentSize -= data.size || 0;
        cleaned++;
      } catch {}
    }
    
    if (cleaned > 0) {
      await saveCacheIndex(cacheIndex);
      console.log(`🧹 Удалено ${cleaned} LRU файлов для освобождения места`);
    }
  } catch (error) {
    console.error('Ошибка умной очистки:', error);
  }
};

/**
 * Полная очистка кэша
 */
export const clearAllCache = async () => {
  try {
    for (const dir of Object.values(CACHE_DIRS)) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
    await ensureCacheDirs();
    console.log('🗑️ Весь медиа-кэш очищен');
    return true;
  } catch (error) {
    console.error('Ошибка очистки кэша:', error);
    return false;
  }
};

// Экспорт для обратной совместимости с videoCache
export const getCachedVideo = (url) => getCachedMedia(url, 'video_circle');
export const preloadVideos = (urls) => preloadMediaList(urls, 'video_circle');

export default {
  getCachedMedia,
  checkCache,
  preloadMedia,
  preloadMediaItems,
  preloadMediaList,
  getCacheStats,
  cleanOldCache,
  cleanCacheIfNeeded,
  clearAllCache,
  // Обратная совместимость
  getCachedVideo,
  preloadVideos,
};
