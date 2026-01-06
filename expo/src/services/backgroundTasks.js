import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showLocalNotification, NotificationTemplates } from './notifications';

const BACKGROUND_FETCH_TASK = 'background-fetch-messages';

// Регистрируем фоновую задачу
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    console.log('Выполняется фоновая задача проверки сообщений');
    
    // Получаем данные пользователя
    const userData = await AsyncStorage.getItem('user');
    const token = await AsyncStorage.getItem('token');
    
    if (!userData || !token) {
      console.log('Нет пользователя или токена для фоновой задачи');
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    
    let user;
    try {
      user = JSON.parse(userData);
    } catch (parseError) {
      console.log('Ошибка парсинга пользователя:', parseError);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    
    if (!user || !user.id) {
      console.log('Данные пользователя некорректны');
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    
    // Проверяем новые сообщения через API
    try {
      const response = await fetch('http://151.247.196.66:3001/api/messages/unread', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Показываем уведомления для новых сообщений
        if (data.messages && data.messages.length > 0) {
          for (const message of data.messages) {
            const template = NotificationTemplates.newMessage(
              message.sender_username || 'Пользователь',
              message.message
            );
            
            await showLocalNotification(
              template.title,
              template.body,
              { chatId: message.sender_id, messageId: message.id },
              template.type
            );
          }
        }
        
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    } catch (error) {
      console.log('Ошибка проверки сообщений в фоне:', error);
    }
    
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.log('Ошибка фоновой задачи:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Регистрируем фоновую задачу
export const registerBackgroundFetch = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60 * 1000, // 15 минут
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true, // Добавляем поддержку headless режима
      });
      console.log('Фоновая задача зарегистрирована');
    }
  } catch (error) {
    console.log('Ошибка регистрации фоновой задачи:', error);
  }
};

// Отменяем фоновую задачу
export const unregisterBackgroundFetch = async () => {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    console.log('Фоновая задача отменена');
  } catch (error) {
    console.log('Ошибка отмены фоновой задачи:', error);
  }
};

// Проверяем статус фоновой задачи
export const getBackgroundFetchStatus = async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    console.log('Статус фоновой задачи:', status);
    return status;
  } catch (error) {
    console.log('Ошибка получения статуса фоновой задачи:', error);
    return null;
  }
};