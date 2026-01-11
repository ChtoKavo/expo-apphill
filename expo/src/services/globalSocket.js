/**
 * ГЛОБАЛЬНЫЙ СОКЕТ ДЛЯ ВСЕХ ЗВОНКОВ
 * Используется для:
 * - Слушания входящих звонков
 * - Инициации исходящих звонков
 * - Регистрации push-токена
 * 
 * Одно соединение на всех!
 */

import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../services/notifications';

let globalSocket = null;
let isConnecting = false;
let currentUserId = null;  // ⭐ НОВОЕ: Отслеживаем текущий user_id

/**
 * ⭐ НОВАЯ ФУНКЦИЯ: Пересоздать socket при смене аккаунта
 */
export const resetSocket = async () => {
  if (__DEV__) console.log('🔄 resetSocket: Сброс глобального socket...');
  
  if (globalSocket) {
    try {
      // Отправляем офлайн статус для ТЕКУЩЕГО пользователя
      if (currentUserId) {
        globalSocket.emit('user_status', {
          user_id: currentUserId,
          is_online: false,
          timestamp: new Date().toISOString()
        });
        if (__DEV__) console.log(`📤 Отправлен офлайн статус для user_id ${currentUserId}`);
      }
      
      // Отключаем и удаляем socket
      globalSocket.removeAllListeners();
      globalSocket.disconnect();
      if (__DEV__) console.log('✅ Socket отключен');
    } catch (err) {
      if (__DEV__) console.error('❌ Ошибка при сбросе socket:', err);
    }
  }
  
  globalSocket = null;
  currentUserId = null;
  isConnecting = false;
  if (__DEV__) console.log('✅ resetSocket: Socket полностью сброшен');
};

/**
 * Получить или создать глобальный сокет
 * ⭐ МОДИФИЦИРОВАНО: Проверяет смену user_id и пересоздает socket при необходимости
 */
export const getOrCreateSocket = async (forceUserId = null) => {
  // Получаем текущего пользователя
  const currentUserData = await AsyncStorage.getItem('user');
  const user = currentUserData ? JSON.parse(currentUserData) : null;
  const userId = forceUserId || user?.id;
  
  if (!userId) {
    if (__DEV__) console.error('❌ getOrCreateSocket: Нет user_id');
    throw new Error('Нет данных пользователя');
  }
  
  // ⭐ КРИТИЧНО: Если user_id изменился - пересоздаём socket!
  if (globalSocket && currentUserId && String(currentUserId) !== String(userId)) {
    if (__DEV__) console.log(`🔄 getOrCreateSocket: Смена аккаунта ${currentUserId} → ${userId}, пересоздаём socket`);
    await resetSocket();
  }
  
  // Если сокет уже создан и подключен - вернуть его
  if (globalSocket && globalSocket.connected) {
    if (__DEV__) console.log(`↻ Используем существующий socket для user_id ${userId}`);
    return globalSocket;
  }

  // Если сокет в процессе подключения - ждем полного подключения
  if (isConnecting) {
    if (__DEV__) console.log('⏳ Socket подключается, ждем полного подключения...');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (globalSocket && globalSocket.connected) {
          if (__DEV__) console.log('✅ Socket готов!');
          clearInterval(checkInterval);
          resolve(globalSocket);
        }
      }, 50);
      
      // Таймаут 5 сек
      setTimeout(() => {
        clearInterval(checkInterval);
        if (__DEV__) console.warn('⚠️ Таймаут при ожидании подключения');
        resolve(globalSocket);
      }, 5000);
    });
  }

  try {
    isConnecting = true;

    if (__DEV__) console.log(`🔌 Создаем новый socket для user_id ${userId}...`);

    // ⭐ КРИТИЧНО: Передаём user_id в query для идентификации на сервере
    globalSocket = io('http://151.247.196.66:3001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: {
        user_id: userId
      },
      auth: {
        user_id: userId
      }
    });
    
    currentUserId = userId;

    // Событие подключения
    globalSocket.on('connect', async () => {
      if (__DEV__) console.log(`✅ ГЛАВНОЕ СОЕДИНЕНИЕ: Подключены к серверу для user_id ${currentUserId}`);
      isConnecting = false;
      
      // ⭐ Аутентифицируем сокет с user_id
      globalSocket.emit('authenticate_socket', { user_id: currentUserId });
      
      // ⭐ Отправляем статус "в сети"
      globalSocket.emit('user_status', {
        user_id: currentUserId,
        is_online: true,
        timestamp: new Date().toISOString()
      });
      
      // Сразу регистрируем push-токен
      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          if (__DEV__) console.log(`📝 Отправляем push-токен на сервер...`);
          globalSocket.emit('register_push_token', { 
            pushToken,
            deviceType: 'ios',
            deviceName: 'Mobile Device'
          });
          if (__DEV__) console.log('🔔 Push-токен отправлен на сервер');
        }
      } catch (error) {
        if (__DEV__) console.error('Ошибка регистрации push-токена:', error);
      }
    });

    // Обработка ответа аутентификации
    globalSocket.on('authenticate_socket_response', (data) => {
      if (data.success) {
        if (__DEV__) console.log(`✅ Socket аутентифицирован для пользователя ${data.user_id}`);
      } else {
        if (__DEV__) console.error('❌ Ошибка аутентификации сокета:', data.message);
      }
    });

    // Получение снимка статусов всех друзей при подключении
    globalSocket.on('friends_status_snapshot', (statuses) => {
      if (__DEV__) console.log(`📸 Получен снимок статусов ${statuses?.length || 0} друзей`);
      if (statuses && Array.isArray(statuses)) {
        // Эмитим события для каждого друга
        statuses.forEach(status => {
          globalSocket.emit('update_friend_status', {
            userId: status.user_id,
            is_online: status.is_online === 1 ? true : false
          });
        });
      }
    });

    // Событие разрыва соединения
    globalSocket.on('disconnect', () => {
      if (__DEV__) console.log('❌ Соединение разорвано');
      isConnecting = false;
    });

    // Ошибка соединения
    globalSocket.on('connect_error', (error) => {
      if (__DEV__) console.error('Ошибка соединения:', error.message);
      isConnecting = false;
    });

    if (__DEV__) console.log('🟢 Инициализация globalSocket завершена, waiting for connection...');
    
    // ЖДЕМ полного подключения и аутентификации ДО возврата
    return new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (globalSocket && globalSocket.connected) {
          if (__DEV__) console.log('🔒 globalSocket полностью подключен и готов!');
          clearInterval(checkConnection);
          resolve(globalSocket);
        }
      }, 50);
      
      // Таймаут 5 сек на случай если что-то пошло не так
      setTimeout(() => {
        clearInterval(checkConnection);
        if (globalSocket) {
          if (__DEV__) console.warn('⚠️ Сокет не подключился полностью, но возвращаем его');
          resolve(globalSocket);
        }
      }, 5000);
    });
  } catch (error) {
    if (__DEV__) console.error('Ошибка создания socket:', error);
    isConnecting = false;
    throw error;
  }
};

/**
 * ⭐ МОДИФИЦИРОВАНО: Отключить глобальный сокет с отправкой офлайн статуса
 */
export const disconnectSocket = async () => {
  if (__DEV__) console.log(`🔌 disconnectSocket: Отключение при выходе (user_id: ${currentUserId})...`);
  
  if (globalSocket && currentUserId) {
    try {
      globalSocket.emit('user_status', {
        user_id: currentUserId,
        is_online: false,
        timestamp: new Date().toISOString()
      });
      if (__DEV__) console.log(`📤 Отправлен офлайн статус для user_id ${currentUserId}`);
    } catch (err) {
      if (__DEV__) console.error('❌ Ошибка отправки офлайн статуса:', err);
    }
  }
  
  await resetSocket();
};

export default getOrCreateSocket;
