import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import {
  showLocalNotification,
  NotificationTemplates,
  getScheduledNotifications,
  cancelAllNotifications,
} from '../services/notifications';

export default function DevPanel({ navigation }) {
  const { theme } = useTheme();
  const { success, error, warning } = useModalAlert();
  const [loading, setLoading] = useState(false);

  const sendTest = async () => {
    try {
      await showLocalNotification('Dev: тестовое уведомление', 'Панель разработчика сработала');
      success('Отправлено', 'Тестовое уведомление отправлено');
    } catch (err) {
      console.log('Ошибка отправки тестового уведомления', err);
      error('Ошибка', 'Не удалось отправить тестовое уведомление');
    }
  };

  const sendExamples = () => {
    try {
      // Показываем несколько примеров, как в NotificationSettings
      setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.newMessage('Иван', 'Привет!'))), 500);
      setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.friendRequest('Мария'))), 1000);
      setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.postLike('Алексей', 'Пост'))), 1500);
      setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.newComment('Анна', 'Комментарий'))), 2000);
      success('Показано', 'Примеры уведомлений запущены');
    } catch (err) {
      console.log('Ошибка примеров уведомлений', err);
      error('Ошибка', 'Не удалось показать примеры уведомлений');
    }
  };

  const clearCache = async () => {
    try {
      setLoading(true);
      await AsyncStorage.clear();
      success('Готово', 'Локальный storage очищен (AsyncStorage)');
    } catch (err) {
      console.log('Ошибка очистки кеша', err);
      error('Ошибка', 'Не удалось очистить кеш');
    } finally {
      setLoading(false);
    }
  };

  const showPushToken = async () => {
    try {
      const token = await AsyncStorage.getItem('pushToken');
      Alert.alert('Push token', token || 'Токен не найден');
    } catch (err) {
      console.log('Ошибка получения токена', err);
      error('Ошибка', 'Не удалось получить push токен');
    }
  };

  const showScheduled = async () => {
    try {
      const list = await getScheduledNotifications();
      Alert.alert('Запланированные уведомления', `Найдено: ${list.length}`);
    } catch (err) {
      console.log('Ошибка получения запланированных', err);
      error('Ошибка', 'Не удалось получить список запланированных уведомлений');
    }
  };

  const cancelAll = async () => {
    try {
      await cancelAllNotifications();
      success('Готово', 'Все запланированные уведомления отменены');
    } catch (err) {
      console.log('Ошибка отмены уведомлений', err);
      error('Ошибка', 'Не удалось отменить уведомления');
    }
  };

  const showAppState = () => {
    try {
      const state = AppState.currentState;
      Alert.alert('AppState', state || 'unknown');
    } catch (err) {
      console.log('Ошибка получения AppState', err);
      error('Ошибка', 'Не удалось получить AppState');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.inputBackground }]}> 
      <Text style={[styles.title, { color: theme.text }]}>Панель разработчика</Text>

      <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={sendTest} disabled={loading}>
        <Text style={styles.buttonText}>Отправить тест-уведомление</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#5AA469' }]} onPress={sendExamples}>
        <Text style={styles.buttonText}>Показать примеры уведомлений</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#FF9500' }]} onPress={() => navigation.navigate('NotificationSettings')}>
        <Text style={styles.buttonText}>Открыть настройки уведомлений</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#FF3B30' }]} onPress={clearCache}>
        <Text style={styles.buttonText}>Очистить AsyncStorage</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#666' }]} onPress={showPushToken}>
        <Text style={styles.buttonText}>Показать push токен</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#777' }]} onPress={showScheduled}>
        <Text style={styles.buttonText}>Количество запланированных уведомлений</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#A33' }]} onPress={cancelAll}>
        <Text style={styles.buttonText}>Отменить все запланированные</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: '#444' }]} onPress={showAppState}>
        <Text style={styles.buttonText}>Показать AppState</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    marginHorizontal: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
