/**
 * Logger сервис для условного логирования
 * Логи отключаются в production режиме
 */

const logger = {
  debug: (tag, ...args) => {
    // Отключается в production
    if (__DEV__) {
      console.log(`[${tag}]`, ...args);
    }
  },

  error: (tag, ...args) => {
    // Ошибки логируются всегда
    console.error(`[${tag}]`, ...args);
  },

  warn: (tag, ...args) => {
    // Предупреждения логируются всегда
    console.warn(`[${tag}]`, ...args);
  },

  info: (tag, ...args) => {
    // Info сообщения в dev режиме
    if (__DEV__) {
      console.info(`[${tag}]`, ...args);
    }
  },

  performance: (tag, label, startTime) => {
    // Только в dev режиме
    if (__DEV__) {
      const duration = Date.now() - startTime;
      console.log(`[${tag}] ${label}: ${duration}ms`);
    }
  },
};

export default logger;
