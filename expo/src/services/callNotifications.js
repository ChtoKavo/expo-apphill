import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

// Типы уведомлений для звонков
export const CALL_NOTIFICATION_TYPES = {
  INCOMING_CALL: 'incoming_call',
  CALL_MISSED: 'call_missed',
  CALL_REJECTED: 'call_rejected'
};

// Создание канала для звонков на Android
export async function createCallNotificationChannel() {
  try {
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Входящие звонки',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250, 250, 250],
      lightColor: '#FF0000',
      sound: 'default',
      bypassDnd: true, // Обходит режим "Не беспокоить"
      enableLights: true,
      enableVibration: true,
    });
    console.log('✅ Канал уведомлений для звонков создан');
  } catch (error) {
    console.log('Ошибка создания канала для звонков:', error);
  }
}

// Отправить push-уведомление о входящем звонке
export async function sendIncomingCallNotification(callerName, callType, callData = {}) {
  try {
    const title = `${callType === 'video' ? '📹' : '📞'} ${callerName} ${callType === 'video' ? 'звонит по видео' : 'звонит'}`;
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: `${callType === 'video' ? 'Видео' : 'Аудио'} звонок от ${callerName}`,
        data: {
          type: CALL_NOTIFICATION_TYPES.INCOMING_CALL,
          callType,
          ...callData
        },
        sound: 'default',
        categoryIdentifier: 'CALL_INCOMING',
        badge: 1,
        priority: 'high',
        // Автоматически показывать даже если приложение в фоне
      },
      trigger: null,
    });
    console.log(`📬 Отправлено уведомление о входящем ${callType} звонке от ${callerName}`);
  } catch (error) {
    console.log('Ошибка отправки уведомления о звонке:', error);
  }
}

// Отправить уведомление о пропущенном звонке
export async function sendMissedCallNotification(callerName, callType) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📵 Пропущенный ${callType === 'video' ? 'видео' : 'аудио'} звонок`,
        body: `от ${callerName}`,
        data: {
          type: CALL_NOTIFICATION_TYPES.CALL_MISSED,
          callType,
          callerName
        },
        sound: 'default',
      },
      trigger: null,
    });
    console.log(`📬 Отправлено уведомление о пропущенном звонке от ${callerName}`);
  } catch (error) {
    console.log('Ошибка отправки уведомления о пропущенном звонке:', error);
  }
}

// Отправить уведомление об отклоненном звонке
export async function sendRejectedCallNotification(userName, callType) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📞 Звонок отклонен',
        body: `${userName} отклонил ${callType === 'video' ? 'видео' : 'аудио'} звонок`,
        data: {
          type: CALL_NOTIFICATION_TYPES.CALL_REJECTED,
          callType,
          userName
        },
      },
      trigger: null,
    });
  } catch (error) {
    console.log('Ошибка отправки уведомления об отклоненном звонке:', error);
  }
}

// Воспроизведение рингтона
let soundObject = null;

export async function playCallRingTone() {
  try {
    // Устанавливаем режим громкой связи
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      playsInSilentModeIOS: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: false,
      staysActiveInBackground: true,
    });

    // Проигрываем системный звук
    if (!soundObject) {
      soundObject = new Audio.Sound();
      // Используем встроенный звук уведомлений
      try {
        await soundObject.loadAsync(require('expo-av').Audio.SOUNDOBJECT_NOTIFICATION_URI || require('./default-ringtone.mp3'));
      } catch (err) {
        console.log('Рингтон по умолчанию недоступен, используем системный звук');
      }
    }

    await soundObject.playAsync();
    // Повторяем звук каждые 3 секунды
    soundObject.setOnPlaybackStatusUpdate(async (status) => {
      if (status.didJustFinish) {
        try {
          await soundObject.replayAsync();
        } catch (error) {
          console.log('Ошибка повтора рингтона:', error);
        }
      }
    });
  } catch (error) {
    console.log('Ошибка воспроизведения рингтона:', error);
  }
}

// Остановить рингтон
export async function stopCallRingTone() {
  try {
    if (soundObject) {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
      soundObject = null;
    }
  } catch (error) {
    console.log('Ошибка остановки рингтона:', error);
  }
}

// Получить обработчик для входящих push-уведомлений о звонках
export function getCallNotificationHandler(navigationRef) {
  return (response) => {
    const { data } = response.notification;
    
    if (data.type === CALL_NOTIFICATION_TYPES.INCOMING_CALL) {
      // Если пользователь нажал на уведомление о входящем звонке
      navigationRef?.navigate('IncomingCall', {
        caller: {
          id: data.callerId,
          username: data.callerName,
          avatar: data.callerAvatar
        },
        callType: data.callType,
        callId: data.callId,
      });
    }
  };
}

// Инициализация обработчика для push-уведомлений
export function initializeCallNotificationHandler(navigationRef) {
  // Обработчик клика на уведомление
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const { data } = response.notification;
    
    if (data.type === CALL_NOTIFICATION_TYPES.INCOMING_CALL) {
      console.log('🔔 Клик по уведомлению о входящем звонке');
      navigationRef?.navigate('IncomingCall', {
        caller: {
          id: data.callerId,
          username: data.callerName,
          avatar: data.callerAvatar
        },
        callType: data.callType,
        callId: data.callId,
      });
    }
  });

  return subscription;
}
