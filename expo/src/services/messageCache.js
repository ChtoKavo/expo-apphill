/**
 * Сервис кэширования сообщений
 * Позволяет мгновенно показывать сообщения при открытии чата
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Ключи для хранения
const CHAT_MESSAGES_PREFIX = '@chat_messages_';
const GROUP_MESSAGES_PREFIX = '@group_messages_';
const CACHE_META_KEY = '@messages_cache_meta';

// Максимальное количество сообщений на чат
const MAX_MESSAGES_PER_CHAT = 100;

// Максимальный возраст кэша (7 дней)
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Сохранить сообщения личного чата
 */
export const saveChatMessages = async (recipientId, messages) => {
  try {
    if (!recipientId || !messages || messages.length === 0) return;
    
    // Фильтруем только реальные сообщения (без date разделителей)
    const realMessages = messages
      .filter(m => m.type !== 'date' && m.id)
      .slice(0, MAX_MESSAGES_PER_CHAT);
    
    const key = CHAT_MESSAGES_PREFIX + recipientId;
    const data = {
      messages: realMessages,
      cachedAt: Date.now(),
      recipientId,
    };
    
    await AsyncStorage.setItem(key, JSON.stringify(data));
    await updateCacheMeta(key);
  } catch (error) {
    console.error('Ошибка сохранения сообщений в кэш:', error);
  }
};

/**
 * Загрузить сообщения личного чата из кэша
 */
export const loadChatMessages = async (recipientId) => {
  try {
    if (!recipientId) return null;
    
    const key = CHAT_MESSAGES_PREFIX + recipientId;
    const data = await AsyncStorage.getItem(key);
    
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    
    // Проверяем возраст кэша
    if (Date.now() - parsed.cachedAt > MAX_CACHE_AGE) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    
    return parsed.messages || [];
  } catch (error) {
    console.error('Ошибка загрузки сообщений из кэша:', error);
    return null;
  }
};

/**
 * Сохранить сообщения группового чата
 */
export const saveGroupMessages = async (groupId, messages) => {
  try {
    if (!groupId || !messages || messages.length === 0) return;
    
    const realMessages = messages
      .filter(m => m.type !== 'date' && m.id)
      .slice(0, MAX_MESSAGES_PER_CHAT);
    
    const key = GROUP_MESSAGES_PREFIX + groupId;
    const data = {
      messages: realMessages,
      cachedAt: Date.now(),
      groupId,
    };
    
    await AsyncStorage.setItem(key, JSON.stringify(data));
    await updateCacheMeta(key);
  } catch (error) {
    console.error('Ошибка сохранения групповых сообщений в кэш:', error);
  }
};

/**
 * Загрузить сообщения группового чата из кэша
 */
export const loadGroupMessages = async (groupId) => {
  try {
    if (!groupId) return null;
    
    const key = GROUP_MESSAGES_PREFIX + groupId;
    const data = await AsyncStorage.getItem(key);
    
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    
    if (Date.now() - parsed.cachedAt > MAX_CACHE_AGE) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    
    return parsed.messages || [];
  } catch (error) {
    console.error('Ошибка загрузки групповых сообщений из кэша:', error);
    return null;
  }
};

/**
 * Добавить новое сообщение в кэш (при отправке/получении)
 */
export const addMessageToCache = async (recipientId, message, isGroup = false) => {
  try {
    if (!recipientId || !message) return;
    
    const key = isGroup 
      ? GROUP_MESSAGES_PREFIX + recipientId 
      : CHAT_MESSAGES_PREFIX + recipientId;
    
    const data = await AsyncStorage.getItem(key);
    let messages = [];
    
    if (data) {
      const parsed = JSON.parse(data);
      messages = parsed.messages || [];
    }
    
    // Добавляем новое сообщение в конец
    messages.push(message);
    
    // Ограничиваем количество
    if (messages.length > MAX_MESSAGES_PER_CHAT) {
      messages = messages.slice(-MAX_MESSAGES_PER_CHAT);
    }
    
    const newData = {
      messages,
      cachedAt: Date.now(),
      [isGroup ? 'groupId' : 'recipientId']: recipientId,
    };
    
    await AsyncStorage.setItem(key, JSON.stringify(newData));
  } catch (error) {
    console.error('Ошибка добавления сообщения в кэш:', error);
  }
};

/**
 * Обновить сообщение в кэше (редактирование, прочтение)
 */
export const updateMessageInCache = async (recipientId, messageId, updates, isGroup = false) => {
  try {
    if (!recipientId || !messageId) return;
    
    const key = isGroup 
      ? GROUP_MESSAGES_PREFIX + recipientId 
      : CHAT_MESSAGES_PREFIX + recipientId;
    
    const data = await AsyncStorage.getItem(key);
    if (!data) return;
    
    const parsed = JSON.parse(data);
    const messages = parsed.messages || [];
    
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    
    messages[index] = { ...messages[index], ...updates };
    
    parsed.messages = messages;
    parsed.cachedAt = Date.now();
    
    await AsyncStorage.setItem(key, JSON.stringify(parsed));
  } catch (error) {
    console.error('Ошибка обновления сообщения в кэше:', error);
  }
};

/**
 * Удалить сообщение из кэша
 */
export const deleteMessageFromCache = async (recipientId, messageId, isGroup = false) => {
  try {
    if (!recipientId || !messageId) return;
    
    const key = isGroup 
      ? GROUP_MESSAGES_PREFIX + recipientId 
      : CHAT_MESSAGES_PREFIX + recipientId;
    
    const data = await AsyncStorage.getItem(key);
    if (!data) return;
    
    const parsed = JSON.parse(data);
    parsed.messages = (parsed.messages || []).filter(m => m.id !== messageId);
    parsed.cachedAt = Date.now();
    
    await AsyncStorage.setItem(key, JSON.stringify(parsed));
  } catch (error) {
    console.error('Ошибка удаления сообщения из кэша:', error);
  }
};

/**
 * Обновить метаданные кэша
 */
const updateCacheMeta = async (key) => {
  try {
    const meta = await AsyncStorage.getItem(CACHE_META_KEY);
    const parsed = meta ? JSON.parse(meta) : { keys: [] };
    
    if (!parsed.keys.includes(key)) {
      parsed.keys.push(key);
    }
    
    parsed.lastUpdate = Date.now();
    await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(parsed));
  } catch (error) {
    // Игнорируем ошибки метаданных
  }
};

/**
 * Очистить старый кэш сообщений
 */
export const cleanOldMessageCache = async () => {
  try {
    const meta = await AsyncStorage.getItem(CACHE_META_KEY);
    if (!meta) return;
    
    const parsed = JSON.parse(meta);
    const keys = parsed.keys || [];
    const now = Date.now();
    const validKeys = [];
    
    for (const key of keys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const msgData = JSON.parse(data);
          if (now - msgData.cachedAt < MAX_CACHE_AGE) {
            validKeys.push(key);
          } else {
            await AsyncStorage.removeItem(key);
          }
        }
      } catch {
        // Удаляем битые записи
        await AsyncStorage.removeItem(key);
      }
    }
    
    parsed.keys = validKeys;
    await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(parsed));
    
    if (keys.length !== validKeys.length) {
      console.log(`🧹 Очищено ${keys.length - validKeys.length} старых кэшей сообщений`);
    }
  } catch (error) {
    console.error('Ошибка очистки кэша сообщений:', error);
  }
};

/**
 * Полная очистка кэша сообщений
 */
export const clearAllMessageCache = async () => {
  try {
    const meta = await AsyncStorage.getItem(CACHE_META_KEY);
    if (meta) {
      const parsed = JSON.parse(meta);
      for (const key of parsed.keys || []) {
        await AsyncStorage.removeItem(key);
      }
    }
    await AsyncStorage.removeItem(CACHE_META_KEY);
    console.log('🗑️ Весь кэш сообщений очищен');
  } catch (error) {
    console.error('Ошибка полной очистки кэша:', error);
  }
};

/**
 * Получить статистику кэша
 */
export const getMessageCacheStats = async () => {
  try {
    const meta = await AsyncStorage.getItem(CACHE_META_KEY);
    if (!meta) return { chats: 0, groups: 0, totalMessages: 0 };
    
    const parsed = JSON.parse(meta);
    const keys = parsed.keys || [];
    
    let chats = 0;
    let groups = 0;
    let totalMessages = 0;
    
    for (const key of keys) {
      if (key.startsWith(CHAT_MESSAGES_PREFIX)) chats++;
      if (key.startsWith(GROUP_MESSAGES_PREFIX)) groups++;
      
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const msgData = JSON.parse(data);
          totalMessages += (msgData.messages || []).length;
        }
      } catch {}
    }
    
    return { chats, groups, totalMessages };
  } catch {
    return { chats: 0, groups: 0, totalMessages: 0 };
  }
};

export default {
  saveChatMessages,
  loadChatMessages,
  saveGroupMessages,
  loadGroupMessages,
  addMessageToCache,
  updateMessageInCache,
  deleteMessageFromCache,
  cleanOldMessageCache,
  clearAllMessageCache,
  getMessageCacheStats,
};
