import { Image } from 'react-native';

/**
 * Сервис кеширования изображений
 * Предзагружает и кеширует аватары и медиа
 */
class ImageCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
    this.preloadQueue = [];
    this.isPreloading = false;
  }

  async preload(uri) {
    if (!uri) return;
    if (this.cache.has(uri)) return;

    // Добавляем в очередь
    this.preloadQueue.push(uri);

    // Запускаем обработку очереди если не идёт
    if (!this.isPreloading) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) return;

    this.isPreloading = true;

    // Обрабатываем по одному с задержкой чтобы не блокировать UI
    while (this.preloadQueue.length > 0) {
      const uri = this.preloadQueue.shift();

      try {
        await Image.prefetch(uri);
        this.cache.set(uri, true);

        // Ограничиваем размер кеша
        if (this.cache.size > this.maxSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        // Даём браузеру отдохнуть
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (err) {
        // Игнорируем ошибки кеширования
      }
    }

    this.isPreloading = false;
  }

  isCached(uri) {
    return this.cache.has(uri);
  }

  clear() {
    this.cache.clear();
    this.preloadQueue = [];
  }

  getSize() {
    return this.cache.size;
  }
}

export const imageCache = new ImageCache();
