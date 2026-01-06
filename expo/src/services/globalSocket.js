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

/**
 * Получить или создать глобальный сокет
 */
export const getOrCreateSocket = async () => {
  // Если сокет уже создан и подключен - вернуть его
  if (globalSocket && globalSocket.connected) {
    console.log('↻ Используем существующий socket (уже подключен)');
    return globalSocket;
  }

  // Если сокет в процессе подключения - ждем полного подключения
  if (isConnecting) {
    console.log('⏳ Socket подключается, ждем полного подключения...');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (globalSocket && globalSocket.connected) {
          console.log('✅ Socket готов!');
          clearInterval(checkInterval);
          resolve(globalSocket);
        }
      }, 50);
      
      // Таймаут 5 сек
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn('⚠️ Таймаут при ожидании подключения');
        resolve(globalSocket);
      }, 5000);
    });
  }

  try {
    isConnecting = true;
    
    const currentUserData = await AsyncStorage.getItem('user');
    if (!currentUserData) {
      throw new Error('Нет данных пользователя');
    }

    const currentUser = JSON.parse(currentUserData);

    console.log('🔌 Создаем новый socket соединение...');

    globalSocket = io('http://151.247.196.66:3001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: {
        user_id: currentUser.id
      }
    });

    // Событие подключения
    globalSocket.on('connect', async () => {
      console.log('✅ ГЛАВНОЕ СОЕДИНЕНИЕ: Подключены к серверу');
      isConnecting = false;
      
      // ⭐ Аутентифицируем сокет с user_id
      globalSocket.emit('authenticate_socket', { user_id: currentUser.id });
      
      // Сразу регистрируем push-токен
      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          console.log(`📝 Отправляем push-токен на сервер...`);
          globalSocket.emit('register_push_token', { 
            pushToken,
            deviceType: 'ios',
            deviceName: 'Mobile Device'
          });
          console.log('🔔 Push-токен отправлен на сервер');
        }
      } catch (error) {
        console.error('Ошибка регистрации push-токена:', error);
      }
    });

    // Обработка ответа аутентификации
    globalSocket.on('authenticate_socket_response', (data) => {
      if (data.success) {
        console.log(`✅ Socket аутентифицирован для пользователя ${data.user_id}`);
      } else {
        console.error('❌ Ошибка аутентификации сокета:', data.message);
      }
    });

    // Получение снимка статусов всех друзей при подключении
    globalSocket.on('friends_status_snapshot', (statuses) => {
      console.log(`📸 Получен снимок статусов ${statuses?.length || 0} друзей`);
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
      console.log('❌ Соединение разорвано');
      isConnecting = false;
    });

    // Ошибка соединения
    globalSocket.on('connect_error', (error) => {
      console.error('Ошибка соединения:', error.message);
      isConnecting = false;
    });

    // 🔍 ДИАГНОСТИКА: Слушаем ВСЕ события с сервера
    globalSocket.onAny((eventName, ...args) => {
      if (eventName.includes('group') || eventName.includes('message')) {
        console.log(`\n📡 [globalSocket] ПОЛУЧЕНО СОБЫТИЕ: ${eventName}`);
        console.log(`   Данные (первые 300 символов):`, 
          JSON.stringify(args[0]).substring(0, 300));
      }
    });

    // 🔴 КРИТИЧЕСКИЙ: Слушатель на new_group_message в самом globalSocket!
    // Это гарантирует что мы ловим событие ВСЕГДА
    globalSocket.on('new_group_message', (message) => {
      console.log('\n🔔🔔🔔 [globalSocket] ВСЕ new_group_message события логируются здесь!');
      console.log(`   Message ID: ${message?.id}`);
      console.log(`   Group ID: ${message?.group_id}`);
      console.log(`   Sender: ${message?.sender_id}`);
    });

    console.log('🟢 Инициализация globalSocket завершена, waiting for connection...');
    
    // ЖДЕМ полного подключения и аутентификации ДО возврата
    return new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (globalSocket && globalSocket.connected) {
          console.log('🔒 globalSocket полностью подключен и готов!');
          clearInterval(checkConnection);
          resolve(globalSocket);
        }
      }, 50);
      
      // Таймаут 5 сек на случай если что-то пошло не так
      setTimeout(() => {
        clearInterval(checkConnection);
        if (globalSocket) {
          console.warn('⚠️ Сокет не подключился полностью, но возвращаем его');
          resolve(globalSocket);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('Ошибка создания socket:', error);
    isConnecting = false;
    throw error;
  }
};

/**
 * Отключить глобальный сокет
 */
export const disconnectSocket = () => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
    isConnecting = false;
    console.log('🔌 Socket отключен');
  }
};

export default getOrCreateSocket;
