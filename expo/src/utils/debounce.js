/**
 * Дебаунс функция для оптимизации частых вызовов
 * @param {Function} func - функция для дебаунса
 * @param {number} wait - время ожидания в мс
 * @returns {Function} - дебаунсированная функция
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle функция для ограничения частоты вызовов
 * @param {Function} func - функция для throttle
 * @param {number} limit - минимальный интервал между вызовами в мс
 * @returns {Function} - throttled функция
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export default debounce;
