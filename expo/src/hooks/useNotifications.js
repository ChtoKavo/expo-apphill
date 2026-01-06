import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  registerForPushNotificationsAsync, 
  showNotificationIfEnabled,
  NotificationTemplates,
  NOTIFICATION_TYPES,
  NOTIFICATION_ACTIONS 
} from '../services/notifications';

export default function useNotifications() {
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync();

    notificationListener.current = Notifications.addNotificationReceivedListener(async notification => {
      console.log('Получено уведомление:', notification);
      
      // 🔔 НОВОЕ: Не показывать push если ты сам отправил сообщение
      const { data } = notification.request.content;
      const currentUser = JSON.parse(await AsyncStorage.getItem('user') || '{}');
      
      // Если sender_id совпадает с текущим пользователем - не показываем уведомление
      if (data?.sender_id && parseInt(data.sender_id) === currentUser?.id) {
        console.log('⚠️ Push от самого себя - уведомление скрыто');
        // Подавляем уведомление
        return;
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Нажатие на уведомление:', response);
      
      // 🆕 Обработка действий из уведомления
      const { actionIdentifier, notification } = response;
      const { data } = notification.request.content;
      
      // Если это действие "Ответить" - открыть модальное окно для ответа
      if (actionIdentifier === NOTIFICATION_ACTIONS.REPLY) {
        console.log('📝 Пользователь хочет ответить на уведомление');
        handleNotificationReply(data);
      } else {
        // Иначе обычный клик по уведомлению
        handleNotificationPress(response);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const handleNotificationPress = (response) => {
    const { notification } = response;
    const { data } = notification.request.content;
    
    console.log('📱 Клик по уведомлению, тип:', data?.type);
    
    switch (data?.type) {
      case NOTIFICATION_TYPES.MESSAGE:
        console.log('Переход к чату:', data.senderId);
        // 🆕 Это должно быть обработано навигацией приложения
        // Отправляем событие через глобальное состояние или навигацию
        handleOpenChat(data);
        break;
      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        console.log('Переход к заявкам в друзья');
        break;
      case NOTIFICATION_TYPES.POST_LIKE:
      case NOTIFICATION_TYPES.COMMENT:
        console.log('Переход к посту:', data.postId);
        break;
      default:
        console.log('Обычное уведомление');
    }
  };

  // 🆕 Обработка ответа на сообщение из уведомления
  const handleNotificationReply = async (data) => {
    try {
      const currentUser = JSON.parse(await AsyncStorage.getItem('user') || '{}');
      
      console.log('📝 Ответ на сообщение от:', data.senderId);
      console.log('   Текущий пользователь:', currentUser.id);
      
      // Здесь будет логика для открытия чата с предзаполненным полем
      // и отправки сообщения
      handleOpenChat(data, true); // true = открыть с фокусом на поле ввода
    } catch (error) {
      console.error('❌ Ошибка обработки ответа на уведомление:', error);
    }
  };

  // 🆕 Открыть чат с отправителем
  const handleOpenChat = (data, focusInput = false) => {
    try {
      // Это должно быть связано с навигацией приложения
      // Отправляем сигнал приложению через глобальное хранилище
      AsyncStorage.setItem('pendingNotificationChat', JSON.stringify({
        senderId: data.senderId,
        senderName: data.senderName,
        focusInput,
        timestamp: Date.now()
      })).then(() => {
        console.log('✅ Сохранено намерение открыть чат');
      });
    } catch (error) {
      console.error('❌ Ошибка открытия чата:', error);
    }
  };

  const sendMessageNotification = async (senderName, message, chatId, senderId) => {
    const template = NotificationTemplates.newMessage(senderName, message);
    await showNotificationIfEnabled(template, { chatId, senderId, senderName });
  };

  const sendFriendRequestNotification = async (userName, userId) => {
    const template = NotificationTemplates.friendRequest(userName);
    await showNotificationIfEnabled(template, { userId });
  };

  const sendPostLikeNotification = async (userName, postTitle, postId) => {
    const template = NotificationTemplates.postLike(userName, postTitle);
    await showNotificationIfEnabled(template, { postId });
  };

  const sendCommentNotification = async (userName, postTitle, postId, commentId) => {
    const template = NotificationTemplates.newComment(userName, postTitle);
    await showNotificationIfEnabled(template, { postId, commentId });
  };

  const sendSystemNotification = async (message) => {
    const template = NotificationTemplates.systemUpdate(message);
    await showNotificationIfEnabled(template);
  };

  return {
    sendMessageNotification,
    sendFriendRequestNotification,
    sendPostLikeNotification,
    sendCommentNotification,
    sendSystemNotification,
  };
}