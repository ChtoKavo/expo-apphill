import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { userAPI } from './api';

let statusSocket = null;
let currentUser = null;

export const initializeOnlineStatus = async () => {
  try {
    const userData = await AsyncStorage.getItem('user');
    if (!userData) {
      console.log('Нет данных пользователя для инициализации статуса');
      return;
    }
    
    try {
      currentUser = JSON.parse(userData);
    } catch (parseError) {
      console.error('Ошибка парсинга данных пользователя:', parseError);
      return;
    }
    
    if (!currentUser || !currentUser.id) {
      console.log('Данные пользователя некорректны после парсинга');
      currentUser = null;
      return;
    }
    
    if (statusSocket) {
      statusSocket.disconnect();
    }
    
    statusSocket = io('http://151.247.196.66:3001', {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    statusSocket.on('connect', async () => {
      console.log('Статус подключен');
      try {
        if (!currentUser || !currentUser.id) {
          console.log('currentUser невалиден при подключении');
          return;
        }
        
        // Конвертируем boolean в правильный формат
        const statusValue = true;
        console.log('Отправляем статус online:', statusValue);
        await userAPI.updateOnlineStatus(statusValue);
        
        statusSocket.emit('user_online', { 
          userId: currentUser.id,
          timestamp: new Date().toISOString(),
          deviceInfo: {
            type: Platform.OS,
            version: Platform.Version
          }
        });
      } catch (error) {
        console.error('Ошибка обновления статуса при подключении:', error.message);
      }
    });
    
    statusSocket.on('disconnect', async () => {
      console.log('Статус отключен');
      try {
        const token = await AsyncStorage.getItem('token');
        const userData = await AsyncStorage.getItem('user');
        
        if (!token || !userData) {
          console.log('Токен или пользователь отсутствуют, пропускаем обновление статуса');
          return;
        }
        
        // Проверяем что currentUser все еще валиден
        if (!currentUser || !currentUser.id) {
          console.log('currentUser невалиден при отключении');
          return;
        }
        
        // Конвертируем boolean в правильный формат
        const statusValue = false;
        console.log('Отправляем статус offline при disconnect:', statusValue);
        
        // Обновляем статус с обработкой ошибок
        await userAPI.updateOnlineStatus(statusValue).catch(err => {
          // Ошибка сети - это нормально при отключении
          console.log('Не удалось отправить статус offline (возможно потеря сети)');
        });
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('Требуется повторная авторизация');
        } else {
          console.log('Ошибка обновления статуса при отключении (не критично):', error.message);
        }
      }
    });
    
    statusSocket.on('connect_error', (error) => {
      console.error('Ошибка подключения статуса:', error);
    });
    
    statusSocket.on('reconnect', (attemptNumber) => {
      console.log('Переподключение статуса, попытка:', attemptNumber);
    });
    
    statusSocket.on('error', (error) => {
      console.error('Ошибка сокета статуса:', error);
    });
    
    return statusSocket;
    
  } catch (error) {
    console.error('Ошибка инициализации статуса:', error);
  }
};

export const setUserOffline = () => {
  // Отправляем offline событие через сокет
  if (statusSocket && currentUser && currentUser.id) {
    try {
      statusSocket.emit('user_offline', currentUser.id);
    } catch (error) {
      console.log('Ошибка при отправке offline события:', error);
    }
  }
  
  // Отправляем статус на сервер через API
  if (currentUser && currentUser.id) {
    try {
      // Конвертируем boolean в правильный формат
      const statusValue = false;
      console.log('Отправляем статус offline:', statusValue);
      
      userAPI.updateOnlineStatus(statusValue).catch(error => {
        // Ошибка при отправке статуса - не критично при отключении
        console.log('Не удалось отправить статус offline при отключении:', error.message);
      });
    } catch (error) {
      console.log('Ошибка при отправке статуса offline:', error);
    }
  }
};

export const disconnectOnlineStatus = () => {
  if (statusSocket) {
    setUserOffline();
    statusSocket.disconnect();
    statusSocket = null;
  }
};

export const getStatusSocket = () => statusSocket;