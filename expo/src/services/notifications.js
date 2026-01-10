import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authAPI, userAPI } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Глобальное состояние активного чата
let currentActiveChatId = null;
let currentActiveChatType = null; // 'personal' или 'group'

export const setActiveChatContext = (chatId, chatType = 'personal') => {
  currentActiveChatId = chatId;
  currentActiveChatType = chatType;
  if (__DEV__) console.log(`📍 Активный чат установлен: chatId=${chatId}, type=${chatType}`);
};

export const clearActiveChatContext = () => {
  currentActiveChatId = null;
  currentActiveChatType = null;
  if (__DEV__) console.log('📍 Активный чат очищен');
};

export const getActiveChatContext = () => ({
  chatId: currentActiveChatId,
  chatType: currentActiveChatType
});

// Настройка обработчика уведомлений - УЛУЧШЕНО ДЛЯ РАБОТЫ В ФОНЕ
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const { data } = notification.request.content;
      const currentUser = JSON.parse(await AsyncStorage.getItem('user') || '{}');
      
      // ❌ ИСПРАВЛЕНИЕ 1: Не показывать push если это от самого себя
      if (data?.sender_id && parseInt(data.sender_id) === currentUser?.id) {
        if (__DEV__) console.log('⚠️ Уведомление от самого себя - скрывается');
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      
      // ❌ ИСПРАВЛЕНИЕ 2: Не показывать push если пользователь внутри этого чата
      const isInChat = (data?.sender_id && currentActiveChatId === parseInt(data.sender_id) && currentActiveChatType === 'personal') ||
                       (data?.group_id && currentActiveChatId === parseInt(data.group_id) && currentActiveChatType === 'group');
      
      if (isInChat) {
        if (__DEV__) console.log('⚠️ Пользователь внутри чата - локальное уведомление не показывается');
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      
      // ✅ ИСПРАВЛЕНИЕ 3: Показывать push даже когда приложение в фоне/закрыто
      if (__DEV__) console.log('✅ Показываем push-уведомление (приложение может быть в любом состоянии)');
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    } catch (error) {
      if (__DEV__) console.error('❌ Ошибка в handleNotification:', error);
      // При ошибке всегда показываем уведомление (безопасный режим)
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    }
  },
});

// Типы уведомлений
export const NOTIFICATION_TYPES = {
  MESSAGE: 'message',
  FRIEND_REQUEST: 'friend_request',
  POST_LIKE: 'post_like',
  COMMENT: 'comment',
  SYSTEM: 'system'
};

// 🆕 Типы действий в уведомлениях
export const NOTIFICATION_ACTIONS = {
  REPLY: 'reply',
  OPEN_CHAT: 'open_chat',
  DISMISS: 'dismiss'
};

// Регистрация для push-уведомлений
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    // Создание каналов уведомлений для Android
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Сообщения',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFA705',
      sound: 'default'
    });

    await Notifications.setNotificationChannelAsync('social', {
      name: 'Социальные',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150, 150, 150],
      lightColor: '#FF8C00',
      sound: 'default'
    });

    await Notifications.setNotificationChannelAsync('system', {
      name: 'Системные',
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0, 100],
      lightColor: '#FF7B00',
      sound: 'default'
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('Разрешение на уведомления не получено');
      return null;
    }
    
    try {
      if (__DEV__) console.log('Начинаем получение push токена...');
      
      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId: "a118b9eb-eeb3-4395-9f2a-31063bd47ece"
      });
      
      if (__DEV__) console.log('Получен результат токена:', tokenResult);
      token = tokenResult.data;
      
      if (!token) {
        if (__DEV__) console.log('Токен не был получен');
        return null;
      }

      if (__DEV__) console.log('✅ Получен push токен:', token);
      
      // Сохраняем токен локально
      await AsyncStorage.setItem('pushToken', token);
      
      // Отправляем токен на сервер
      const tokenData = {
        pushToken: token,
        deviceType: Platform.OS,
        deviceName: Device.deviceName || 'Unknown Device'
      };
      
      console.log('📤 Отправляем push токен на сервер:', tokenData);
      
      try {
        // Проверяем наличие токена перед отправкой
        const storedToken = await AsyncStorage.getItem('token');
        if (!storedToken) {
          console.warn('⚠️ Токен аутентификации не найден в AsyncStorage. Push токен не будет отправлен до входа пользователя');
          return token;
        }
        
        const response = await userAPI.registerPushToken(tokenData);
        console.log('✅ Push токен успешно зарегистрирован на сервере:', response.data);
      } catch (error) {
        console.error('❌ Ошибка при регистрации push токена на сервере:', error.response?.data || error.message);
        // Не прерываем процесс, если ошибка - просто логируем
        console.warn('⚠️ Push токен получен локально, но не отправлен на сервер. Будет пересредан при следующей возможности');
      }
    } catch (error) {
      console.log('❌ Ошибка получения push токена:', error);
    }
  } else {
    console.log('Уведомления работают только на физическом устройстве');
  }

  return token;
}

// Функция для пересылки push токена на сервер после входа пользователя
export async function resendPushTokenAfterLogin() {
  try {
    const pushToken = await AsyncStorage.getItem('pushToken');
    const authToken = await AsyncStorage.getItem('token');
    
    if (!pushToken || !authToken) {
      console.warn('⚠️ Push токен или токен аутентификации не найдены');
      return;
    }
    
    const tokenData = {
      pushToken: pushToken,
      deviceType: Platform.OS,
      deviceName: Device.deviceName || 'Unknown Device'
    };
    
    console.log('📤 Переотправляем push токен на сервер после входа:', tokenData);
    
    const response = await userAPI.registerPushToken(tokenData);
    console.log('✅ Push токен успешно переотправлен на сервер:', response.data);
  } catch (error) {
    console.error('❌ Ошибка при переотправке push токена:', error.response?.data || error.message);
  }
}

// Показать локальное уведомление
export async function showLocalNotification(title, body, data = {}, type = NOTIFICATION_TYPES.SYSTEM) {
  const channelId = getChannelForType(type);
  
  // 🆕 Для уведомлений о сообщениях добавляем кнопку ответа (на Android)
  const notificationContent = {
    title,
    body,
    data: { ...data, type },
    sound: 'default',
    categoryIdentifier: type,
  };

  // На iOS и Android можно добавить действия для сообщений
  if (type === NOTIFICATION_TYPES.MESSAGE && Platform.OS === 'ios') {
    // iOS поддерживает категории с действиями
    notificationContent.categoryIdentifier = 'MESSAGE_REPLY';
  }
  
  await Notifications.scheduleNotificationAsync({
    content: notificationContent,
    trigger: null,
  });
}

// Запланировать уведомление
export async function scheduleNotification(title, body, triggerDate, data = {}, type = NOTIFICATION_TYPES.SYSTEM) {
  const trigger = {
    date: triggerDate,
  };
  
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { ...data, type },
      sound: 'default',
      categoryIdentifier: type,
    },
    trigger,
  });
  
  return identifier;
}

// Отменить запланированное уведомление
export async function cancelNotification(identifier) {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Отменить все запланированные уведомления
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Получить все запланированные уведомления
export async function getScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// Уведомления для разных событий
export const NotificationTemplates = {
  newMessage: (senderName, message) => ({
    title: `Новое сообщение от ${senderName}`,
    body: message,
    type: NOTIFICATION_TYPES.MESSAGE
  }),
  
  friendRequest: (userName) => ({
    title: 'Новая заявка в друзья',
    body: `${userName} хочет добавить вас в друзья`,
    type: NOTIFICATION_TYPES.FRIEND_REQUEST
  }),
  
  postLike: (userName, postTitle) => ({
    title: 'Новый лайк',
    body: `${userName} оценил ваш пост "${postTitle}"`,
    type: NOTIFICATION_TYPES.POST_LIKE
  }),
  
  newComment: (userName, postTitle) => ({
    title: 'Новый комментарий',
    body: `${userName} прокомментировал ваш пост "${postTitle}"`,
    type: NOTIFICATION_TYPES.COMMENT
  }),
  
  systemUpdate: (message) => ({
    title: 'Системное уведомление',
    body: message,
    type: NOTIFICATION_TYPES.SYSTEM
  })
};

// Вспомогательная функция для определения канала
function getChannelForType(type) {
  switch (type) {
    case NOTIFICATION_TYPES.MESSAGE:
      return 'messages';
    case NOTIFICATION_TYPES.FRIEND_REQUEST:
    case NOTIFICATION_TYPES.POST_LIKE:
    case NOTIFICATION_TYPES.COMMENT:
      return 'social';
    case NOTIFICATION_TYPES.SYSTEM:
    default:
      return 'system';
  }
}

// Настройки уведомлений пользователя
export const NotificationSettings = {
  async getSettings() {
    try {
      const settings = await AsyncStorage.getItem('notificationSettings');
      return settings ? JSON.parse(settings) : {
        messages: true,
        friendRequests: true,
        postLikes: true,
        comments: true,
        system: true
      };
    } catch (error) {
      console.log('Ошибка получения настроек уведомлений:', error);
      return {};
    }
  },
  
  async updateSettings(newSettings) {
    try {
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    } catch (error) {
      console.log('Ошибка сохранения настроек уведомлений:', error);
    }
  },
  
  async isTypeEnabled(type) {
    const settings = await this.getSettings();
    switch (type) {
      case NOTIFICATION_TYPES.MESSAGE:
        return settings.messages;
      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        return settings.friendRequests;
      case NOTIFICATION_TYPES.POST_LIKE:
        return settings.postLikes;
      case NOTIFICATION_TYPES.COMMENT:
        return settings.comments;
      case NOTIFICATION_TYPES.SYSTEM:
        return settings.system;
      default:
        return true;
    }
  }
};

// Показать уведомление с проверкой настроек
export async function showNotificationIfEnabled(template, data = {}) {
  const isEnabled = await NotificationSettings.isTypeEnabled(template.type);
  if (isEnabled) {
    await showLocalNotification(template.title, template.body, data, template.type);
  }
}