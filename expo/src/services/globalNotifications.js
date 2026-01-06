import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveChatContext } from './notifications';

let globalSocket = null;
let currentUser = null;

// Простая шина для локальных подписчиков на новые сообщения
const _newMessageListeners = new Set();

export function subscribeToNewMessages(fn) {
  _newMessageListeners.add(fn);
  return () => _newMessageListeners.delete(fn);
}

function _emitNewMessage(message, isGroup = false) {
  console.log(`🔔 _emitNewMessage вызвана: ${isGroup ? 'группа' : 'личное'}, слушателей: ${_newMessageListeners.size}`);
  for (const fn of _newMessageListeners) {
    try {
      fn(message, isGroup);
    } catch (e) {
      console.warn('Ошибка в подписчике newMessage', e);
    }
  }
}

export const initializeGlobalNotifications = async () => {
  try {
    const userData = await AsyncStorage.getItem('user');
    if (!userData) return;
    
    currentUser = JSON.parse(userData);
    
    if (globalSocket) {
      globalSocket.disconnect();
    }
    
    globalSocket = io('http://151.247.196.66:3001', {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000
    });
    
    globalSocket.on('connect', () => {
      console.log('✅ Глобальные уведомления подключены');
      // Уведомляем сервер о том, что мы хотим получать уведомления
      globalSocket.emit('subscribe_notifications', currentUser.id);
    });
    
    globalSocket.on('new_message', (message) => {
      console.log('📩 Получено личное сообщение:', {
        from: message.sender_username,
        text: message.message?.slice(0, 50),
        senderId: message.sender_id
      });

      // Эмитим событие локальным подписчикам (UI может реагировать и поднимать чат)
      _emitNewMessage(message, false);

      // ✅ ИСПРАВЛЕНИЕ: Не показывать push если:
      // 1) сообщение для текущего пользователя
      // 2) НЕ от самого себя
      // 3) пользователь НЕ внутри чата с отправителем
      if (message.receiver_id === currentUser.id && message.sender_id !== currentUser.id) {
        // Проверяем, находится ли пользователь внутри чата с этим отправителем
        const activeChat = getActiveChatContext();
        const isInThisChat = activeChat.chatId === message.sender_id && activeChat.chatType === 'personal';
        
        if (isInThisChat) {
          console.log(`📍 Пользователь внутри чата с ${message.sender_username} - push НЕ отправляется`);
          // Уведомление не показываем, но обновляем UI локально через эмит выше
          return;
        }
        
        console.log(`📬 Push-уведомление отправляется с сервера для сообщения от ${message.sender_username}`);
      } else if (message.receiver_id === currentUser.id && message.sender_id === currentUser.id) {
        console.log('⚠️ Игнорируем сообщение от самого себя');
      }
    });
    
    globalSocket.on('new_group_message', (message) => {
      console.log('📩 Получено групповое сообщение:', {
        from: message.sender_username,
        group: message.group_name,
        text: message.message?.slice(0, 50)
      });

      // Эмитим событие локальным подписчикам (UI может реагировать и поднимать чат)
      _emitNewMessage(message, true);

      // ✅ ИСПРАВЛЕНИЕ: Не показывать push если:
      // 1) сообщение НЕ от самого себя
      // 2) пользователь НЕ внутри чата с этой группой
      if (message.sender_id !== currentUser.id) {
        // Проверяем, находится ли пользователь внутри чата этой группы
        const activeChat = getActiveChatContext();
        const isInThisGroupChat = activeChat.chatId === message.group_id && activeChat.chatType === 'group';
        
        if (isInThisGroupChat) {
          console.log(`📍 Пользователь внутри группы "${message.group_name}" - push НЕ отправляется`);
          // Уведомление не показываем, но обновляем UI локально через эмит выше
          return;
        }
        
        console.log(`📬 Push-уведомление отправляется с сервера для группы "${message.group_name}"`);
      } else {
        console.log('⚠️ Игнорируем групповое сообщение от самого себя');
      }
    });
    
    globalSocket.on('disconnect', () => {
      console.log('❌ Глобальные уведомления отключены');
    });
    
    globalSocket.on('reconnect', () => {
      console.log('🔄 Переподключение к глобальным уведомлениям');
      globalSocket.emit('subscribe_notifications', currentUser.id);
    });
    
  } catch (error) {
    console.error('❌ Ошибка инициализации глобальных уведомлений:', error);
  }
};

export const disconnectGlobalNotifications = () => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
};