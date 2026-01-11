/**
 * ГЛОБАЛЬНЫЕ СОБЫТИЯ ПРИЛОЖЕНИЯ
 * 
 * Используется для коммуникации между экранами без прямой зависимости.
 * Например: ChatScreen отправляет сообщение -> ChatsListScreen обновляет lastMessage
 * 
 * События:
 * - MESSAGE_SENT: Отправлено новое личное сообщение
 * - GROUP_MESSAGE_SENT: Отправлено новое групповое сообщение
 * - MESSAGE_READ: Сообщение прочитано
 */

// ⭐ СОБСТВЕННАЯ РЕАЛИЗАЦИЯ EventEmitter для React Native
// (Node.js модуль 'events' не работает в React Native)
class SimpleEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, ...args) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`[AppEvents] Error in listener for "${event}":`, error);
      }
    });
  }

  removeAllListeners(event) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

// Создаём глобальный EventEmitter
const appEvents = new SimpleEventEmitter();

// Названия событий
export const APP_EVENTS = {
  MESSAGE_SENT: 'message_sent',
  GROUP_MESSAGE_SENT: 'group_message_sent',
  MESSAGE_READ: 'message_read',
  CHAT_UPDATED: 'chat_updated',
};

/**
 * Эмитить событие о новом отправленном сообщении
 * @param {Object} message - данные сообщения
 */
export const emitMessageSent = (message) => {
  console.log('📢 AppEvents: Эмитим MESSAGE_SENT', message?.id);
  appEvents.emit(APP_EVENTS.MESSAGE_SENT, message);
};

/**
 * Эмитить событие о новом групповом сообщении
 * @param {Object} message - данные сообщения
 */
export const emitGroupMessageSent = (message) => {
  console.log('📢 AppEvents: Эмитим GROUP_MESSAGE_SENT', message?.id);
  appEvents.emit(APP_EVENTS.GROUP_MESSAGE_SENT, message);
};

/**
 * Эмитить событие о прочитанном сообщении
 * @param {Object} data - данные о прочтении
 */
export const emitMessageRead = (data) => {
  console.log('📢 AppEvents: Эмитим MESSAGE_READ', data);
  appEvents.emit(APP_EVENTS.MESSAGE_READ, data);
};

/**
 * Подписаться на событие отправленного сообщения
 * @param {Function} handler - обработчик
 * @returns {Function} функция отписки
 */
export const onMessageSent = (handler) => {
  console.log('📥 AppEvents: Подписка на MESSAGE_SENT');
  appEvents.on(APP_EVENTS.MESSAGE_SENT, handler);
  return () => {
    console.log('🚪 AppEvents: Отписка от MESSAGE_SENT');
    appEvents.off(APP_EVENTS.MESSAGE_SENT, handler);
  };
};

/**
 * Подписаться на событие отправленного группового сообщения
 * @param {Function} handler - обработчик
 * @returns {Function} функция отписки
 */
export const onGroupMessageSent = (handler) => {
  console.log('📥 AppEvents: Подписка на GROUP_MESSAGE_SENT');
  appEvents.on(APP_EVENTS.GROUP_MESSAGE_SENT, handler);
  return () => {
    console.log('🚪 AppEvents: Отписка от GROUP_MESSAGE_SENT');
    appEvents.off(APP_EVENTS.GROUP_MESSAGE_SENT, handler);
  };
};

/**
 * Подписаться на событие прочитанного сообщения
 * @param {Function} handler - обработчик
 * @returns {Function} функция отписки
 */
export const onMessageRead = (handler) => {
  console.log('📥 AppEvents: Подписка на MESSAGE_READ');
  appEvents.on(APP_EVENTS.MESSAGE_READ, handler);
  return () => {
    console.log('🚪 AppEvents: Отписка от MESSAGE_READ');
    appEvents.off(APP_EVENTS.MESSAGE_READ, handler);
  };
};

export default appEvents;
