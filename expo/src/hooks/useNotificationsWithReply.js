import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { messageAPI, groupAPI } from '../services/api';

// Глобальное состояние для ответа на уведомление
let globalReplyState = {
  modalVisible: false,
  replyData: null,
  replyMessage: '',
  isSending: false,
  setters: {}
};

let navigationRef = null;

export const setNavigationRef = (ref) => {
  navigationRef = ref;
};

export default function useNotificationsWithReply() {
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyData, setReplyData] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  // Сохраняем функции установки в глобальном состоянии
  useEffect(() => {
    globalReplyState.setters = {
      setReplyModalVisible,
      setReplyData,
      setReplyMessage,
      setIsSending
    };
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync();

    // Когда приложение получает уведомление в фоне/фокусе
    notificationListener.current = Notifications.addNotificationReceivedListener(
      async (notification) => {
        console.log('\n' + '='.repeat(70));
        console.log('🔔 УВЕДОМЛЕНИЕ ПОЛУЧЕНО (в приложении)');
        console.log(`   Тип: ${notification.request.content.data?.type}`);
        console.log('='.repeat(70));
      }
    );

    // Когда пользователь нажимает на уведомление
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        try {
          const { actionIdentifier, notification } = response;
          const { data } = notification.request.content;
          
          console.log('\n' + '='.repeat(70));
          console.log('📲 КЛИК ПО УВЕДОМЛЕНИЮ');
          console.log(`   Действие: ${actionIdentifier}`);
          console.log(`   Тип: ${data?.type}`);
          console.log(`   Данные: ${JSON.stringify(data)}`);
          console.log('='.repeat(70));

          // Проверяем тип уведомления - если это сообщение, открываем модал ответа
          if (data?.type === 'new_message' || data?.type === 'new_group_message') {
            console.log('📝 Открываем модал ответа на сообщение');
            
            // Открыть модальное окно для ответа
            setReplyData(data);
            setReplyModalVisible(true);
            return;
          }

          // Для других типов уведомлений - стандартный клик
          handleNotificationPress(data);
        } catch (error) {
          console.error('❌ Ошибка обработки клика на уведомление:', error);
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // Обработка клика на уведомление (открыть чат)
  const handleNotificationPress = async (data) => {
    try {
      console.log('\n' + '='.repeat(70));
      console.log('🚀 ОТКРЫВАЕМ ЧАТ ИЗ УВЕДОМЛЕНИЯ');
      console.log(`   Отправитель: ${data?.sender_id}`);
      console.log(`   Группа: ${data?.group_id}`);
      console.log('='.repeat(70));

      if (!navigationRef) {
        console.warn('⚠️ navigationRef не установлен');
        return;
      }

      if (data?.type === 'new_group_message' && data?.group_id) {
        // Открыть групповой чат
        navigationRef.navigate('GroupChat', {
          groupId: parseInt(data.group_id),
          groupName: data.group_name
        });
      } else if (data?.sender_id) {
        // Открыть личный чат
        navigationRef.navigate('Chat', {
          userId: parseInt(data.sender_id),
          userName: data.sender_name || 'User'
        });
      }
    } catch (error) {
      console.error('❌ Ошибка при открытии чата:', error);
    }
  };

  // Отправить ответ на сообщение из уведомления
  const handleSendReply = async () => {
    if (!replyMessage.trim()) {
      console.warn('⚠️ Сообщение пусто');
      return;
    }

    setIsSending(true);
    try {
      console.log('\n' + '='.repeat(70));
      console.log('📤 ОТПРАВЛЯЕМ ОТВЕТ НА УВЕДОМЛЕНИЕ');
      console.log(`   Тип: ${replyData?.type === 'new_group_message' ? 'ГРУППА' : 'ЛИЧНОЕ'}`);
      console.log(`   Сообщение: ${replyMessage.slice(0, 50)}...`);
      console.log('='.repeat(70));

      if (replyData?.type === 'new_group_message') {
        // Ответ на групповое сообщение
        const response = await groupAPI.sendMessage(
          parseInt(replyData.group_id),
          replyMessage
        );
        console.log('✅ Ответ на групповое сообщение отправлен');
      } else {
        // Ответ на личное сообщение
        const response = await messageAPI.sendMessage(
          parseInt(replyData.sender_id),
          replyMessage
        );
        console.log('✅ Ответ на личное сообщение отправлен');
      }

      // Открыть чат с полученным сообщением
      handleNotificationPress(replyData);
      
      // Закрыть модальное окно
      setReplyModalVisible(false);
      setReplyMessage('');
      setReplyData(null);
    } catch (error) {
      console.error('❌ Ошибка при отправке ответа:', error);
      alert('Ошибка при отправке ответа');
    } finally {
      setIsSending(false);
    }
  };

  return {
    replyModalVisible,
    setReplyModalVisible,
    replyData,
    setReplyData,
    replyMessage,
    setReplyMessage,
    isSending,
    handleSendReply,
    handleNotificationPress
  };
}
