import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { NotificationSettings, showLocalNotification, NotificationTemplates } from '../services/notifications';

export default function NotificationSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const [settings, setSettings] = useState({
    messages: true,
    friendRequests: true,
    postLikes: true,
    comments: true,
    system: true
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const currentSettings = await NotificationSettings.getSettings();
    setSettings(currentSettings);
  };

  const updateSetting = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await NotificationSettings.updateSettings(newSettings);
  };

  const testNotification = () => {
    showLocalNotification(
      'Тестовое уведомление',
      'Уведомления работают корректно!',
      {},
      'system'
    );
  };

  const showExampleNotifications = () => {
    Alert.alert(
      'Показать примеры?',
      'Будут показаны примеры всех типов уведомлений',
      [
        { text: 'Отмена', style: 'cancel' },
        { 
          text: 'Показать', 
          onPress: () => {
            setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.newMessage('Иван', 'Привет! Как дела?'))), 1000);
            setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.friendRequest('Мария'))), 2000);
            setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.postLike('Алексей', 'Мой новый пост'))), 3000);
            setTimeout(() => showLocalNotification(...Object.values(NotificationTemplates.newComment('Анна', 'Интересная статья'))), 4000);
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={[styles.content, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Notification Types Section */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="notifications" size={20} color={theme.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Типы уведомлений</Text>
          </View>
          
          <View style={styles.settingsContainer}>
            <SettingItem 
              label="Сообщения"
              icon="chatbubble"
              value={settings.messages}
              onValueChange={(value) => updateSetting('messages', value)}
              theme={theme}
            />
            <SettingItem 
              label="Заявки в друзья"
              icon="person-add"
              value={settings.friendRequests}
              onValueChange={(value) => updateSetting('friendRequests', value)}
              theme={theme}
            />
            <SettingItem 
              label="Лайки постов"
              icon="heart"
              value={settings.postLikes}
              onValueChange={(value) => updateSetting('postLikes', value)}
              theme={theme}
            />
            <SettingItem 
              label="Комментарии"
              icon="chatbox"
              value={settings.comments}
              onValueChange={(value) => updateSetting('comments', value)}
              theme={theme}
            />
            <SettingItem 
              label="Системные"
              icon="settings"
              value={settings.system}
              onValueChange={(value) => updateSetting('system', value)}
              theme={theme}
              isLast={true}
            />
          </View>
        </View>

        {/* Testing Section */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF9500' + '15' }]}>
              <Ionicons name="flask" size={20} color="#FF9500" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Тестирование</Text>
          </View>

          <TouchableOpacity 
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={testNotification}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Тестовое уведомление</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, { backgroundColor: theme.secondary }]}
            onPress={showExampleNotifications}
            activeOpacity={0.7}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.buttonText}>Показать примеры</Text>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={[styles.infoSection, { backgroundColor: theme.primary + '10', borderLeftColor: theme.primary }]}>
          <View style={[styles.infoIcon, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name="information-circle" size={24} color={theme.primary} />
          </View>
          <Text style={[styles.infoText, { color: theme.text }]}>
            Уведомления помогают не пропустить важные события в приложении. Вы можете настроить, какие типы уведомлений хотите получать.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Setting Item Component
const SettingItem = ({ label, icon, value, onValueChange, theme, isLast }) => (
  <View style={[styles.settingItem, !isLast && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
    <View style={styles.settingLeft}>
      <View style={[styles.itemIcon, { backgroundColor: theme.primary + '15' }]}>
        <Ionicons name={icon} size={16} color={theme.primary} />
      </View>
      <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: theme.textLight, true: theme.primary }}
      thumbColor="#fff"
      style={styles.switch}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  section: {
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  settingsContainer: {
    marginTop: 8,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  switch: {
    transform: [{ scale: 1.05 }],
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 20,
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    flex: 1,
  },
});