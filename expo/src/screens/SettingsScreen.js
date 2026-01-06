import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { profileAPI } from '../services/api';

const SettingsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { error, success, warning } = useModalAlert();

  const [privacySettings, setPrivacySettings] = useState({
    allowMessages: true,
    allowCalls: true,
    showOnlineStatus: true,
    showLastSeen: true,
  });

  const [showBlockList, setShowBlockList] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [unblockUserId, setUnblockUserId] = useState('');

  const [notificationSettings, setNotificationSettings] = useState({
    messageNotifications: true,
    callNotifications: true,
    groupNotifications: true,
    soundEnabled: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedPrivacy = await AsyncStorage.getItem('privacySettings');
      const savedNotifications = await AsyncStorage.getItem('notificationSettings');

      if (savedPrivacy) {
        setPrivacySettings(JSON.parse(savedPrivacy));
      }
      if (savedNotifications) {
        setNotificationSettings(JSON.parse(savedNotifications));
      }
    } catch (err) {
      console.log('Ошибка загрузки настроек:', err);
    }
  };

  const savePrivacySettings = async (newSettings) => {
    try {
      setPrivacySettings(newSettings);
      await AsyncStorage.setItem('privacySettings', JSON.stringify(newSettings));
      success('Успех', 'Настройки приватности сохранены');
    } catch (err) {
      error('Ошибка', 'Не удалось сохранить настройки');
    }
  };

  const saveNotificationSettings = async (newSettings) => {
    try {
      setNotificationSettings(newSettings);
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
      success('Успех', 'Настройки уведомлений сохранены');
    } catch (err) {
      error('Ошибка', 'Не удалось сохранить настройки');
    }
  };

  const handleTogglePrivacy = (key) => {
    const newSettings = { ...privacySettings, [key]: !privacySettings[key] };
    savePrivacySettings(newSettings);
  };

  const handleToggleNotification = (key) => {
    const newSettings = { ...notificationSettings, [key]: !notificationSettings[key] };
    saveNotificationSettings(newSettings);
  };

  const blockUser = () => {
    if (!unblockUserId.trim()) {
      warning('Ошибка', 'Введите ID или имя пользователя');
      return;
    }

    // Проверяем дубликаты
    if (blockedUsers.some(user => user.id === unblockUserId)) {
      warning('Ошибка', 'Этот пользователь уже заблокирован');
      return;
    }

    const newBlockedUser = {
      id: unblockUserId,
      blockedAt: new Date().toISOString(),
    };

    setBlockedUsers([...blockedUsers, newBlockedUser]);
    setUnblockUserId('');
    success('Успех', `Пользователь ${unblockUserId} заблокирован`);
  };

  const unblockUser = (userId) => {
    setBlockedUsers(blockedUsers.filter(user => user.id !== userId));
    success('Успех', `Пользователь ${userId} разблокирован`);
  };

  const resetAllSettings = () => {
    Alert.alert(
      'Сброс всех настроек',
      'Вы уверены? Все настройки будут восстановлены по умолчанию',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('privacySettings');
              await AsyncStorage.removeItem('notificationSettings');
              setPrivacySettings({
                allowMessages: true,
                allowCalls: true,
                showOnlineStatus: true,
                showLastSeen: true,
              });
              setNotificationSettings({
                messageNotifications: true,
                callNotifications: true,
                groupNotifications: true,
                soundEnabled: true,
              });
              success('Успех', 'Все настройки восстановлены');
            } catch (err) {
              error('Ошибка', 'Не удалось сбросить настройки');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const privacyItems = [
    {
      key: 'allowMessages',
      label: 'Позволить сообщения',
      description: 'Разрешить другим отправлять вам сообщения',
      icon: 'chatbubble-outline',
    },
    {
      key: 'allowCalls',
      label: 'Позволить звонки',
      description: 'Разрешить другим вам звонить',
      icon: 'call-outline',
    },
    {
      key: 'showOnlineStatus',
      label: 'Показывать статус онлайн',
      description: 'Другие видят когда вы онлайн',
      icon: 'radio-button-on-outline',
    },
    {
      key: 'showLastSeen',
      label: 'Показывать время входа',
      description: 'Другие видят когда вы были в сети',
      icon: 'time-outline',
    },
  ];

  const notificationItems = [
    {
      key: 'messageNotifications',
      label: 'Уведомления о сообщениях',
      description: 'Получать уведомления о новых сообщениях',
      icon: 'mail-outline',
    },
    {
      key: 'callNotifications',
      label: 'Уведомления о звонках',
      description: 'Получать уведомления о входящих звонках',
      icon: 'phone-portrait-outline',
    },
    {
      key: 'groupNotifications',
      label: 'Уведомления групп',
      description: 'Получать уведомления от групп',
      icon: 'people-outline',
    },
    {
      key: 'soundEnabled',
      label: 'Включить звук',
      description: 'Звуковые сигналы при уведомлениях',
      icon: 'volume-medium-outline',
    },
  ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ЗАГОЛОВОК */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Настройки</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* СЕКЦИЯ ПРИВАТНОСТИ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Приватность</Text>
          </View>

          {privacyItems.map((item) => (
            <View
              key={item.key}
              style={[
                styles.settingItem,
                { backgroundColor: theme.surface, borderBottomColor: theme.border },
              ]}
            >
              <View style={styles.settingItemLeft}>
                <View style={[styles.settingIcon, { backgroundColor: `${theme.primary}22` }]}>
                  <Ionicons name={item.icon} size={18} color={theme.primary} />
                </View>
                <View style={styles.settingTextWrapper}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
                  <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                    {item.description}
                  </Text>
                </View>
              </View>
              <Switch
                value={privacySettings[item.key]}
                onValueChange={() => handleTogglePrivacy(item.key)}
                trackColor={{ false: '#D1D5DB', true: `${theme.primary}44` }}
                thumbColor={privacySettings[item.key] ? theme.primary : '#f0f0f0'}
              />
            </View>
          ))}
        </View>

        {/* СЕКЦИЯ УВЕДОМЛЕНИЙ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={20} color="#FF9500" />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Уведомления</Text>
          </View>

          {notificationItems.map((item) => (
            <View
              key={item.key}
              style={[
                styles.settingItem,
                { backgroundColor: theme.surface, borderBottomColor: theme.border },
              ]}
            >
              <View style={styles.settingItemLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#FF950022' }]}>
                  <Ionicons name={item.icon} size={18} color="#FF9500" />
                </View>
                <View style={styles.settingTextWrapper}>
                  <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
                  <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                    {item.description}
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationSettings[item.key]}
                onValueChange={() => handleToggleNotification(item.key)}
                trackColor={{ false: '#D1D5DB', true: '#FF950044' }}
                thumbColor={notificationSettings[item.key] ? '#FF9500' : '#f0f0f0'}
              />
            </View>
          ))}
        </View>

        {/* СЕКЦИЯ БЛОКИРОВКИ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="ban-outline" size={20} color="#FF3B30" />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Заблокированные пользователи</Text>
          </View>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: `${theme.primary}15`, borderColor: theme.primary }]}
            onPress={() => setShowBlockList(!showBlockList)}
            activeOpacity={0.7}
          >
            <Ionicons name={showBlockList ? 'chevron-up' : 'chevron-down'} size={20} color={theme.primary} />
            <Text style={[styles.actionButtonText, { color: theme.primary }]}>
              Заблокировано: {blockedUsers.length}
            </Text>
          </TouchableOpacity>

          {showBlockList && (
            <View style={[styles.blockListContainer, { backgroundColor: theme.surface }]}>
              <View style={styles.blockInputGroup}>
                <TextInput
                  style={[
                    styles.blockInput,
                    { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                  ]}
                  placeholder="ID или имя пользователя"
                  placeholderTextColor={theme.textLight}
                  value={unblockUserId}
                  onChangeText={setUnblockUserId}
                />
                <TouchableOpacity
                  style={[styles.blockButton, { backgroundColor: theme.primary }]}
                  onPress={blockUser}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {blockedUsers.length > 0 ? (
                blockedUsers.map((user) => (
                  <View
                    key={user.id}
                    style={[
                      styles.blockedUserItem,
                      { backgroundColor: theme.background, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.blockedUserInfo}>
                      <Ionicons name="person-circle-outline" size={32} color={theme.textLight} />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={[styles.blockedUserName, { color: theme.text }]}>{user.id}</Text>
                        <Text style={[styles.blockedUserDate, { color: theme.textSecondary }]}>
                          {new Date(user.blockedAt).toLocaleDateString('ru-RU')}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.unblockButton, { borderColor: '#FF3B30' }]}
                      onPress={() => unblockUser(user.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.unblockButtonText}>Разблокировать</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={theme.textLight} />
                  <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                    Нет заблокированных пользователей
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* СЕКЦИЯ О ПРИЛОЖЕНИИ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={20} color="#4D96FF" />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>О приложении</Text>
          </View>

          <View style={[styles.infoItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Версия приложения</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>1.0.0</Text>
          </View>

          <View style={[styles.infoItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Сборка</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>Build 2024.12</Text>
          </View>

          <View style={[styles.infoItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Платформа</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>React Native / Expo</Text>
          </View>
        </View>

        {/* КНОПКА СБРОСА */}
        <TouchableOpacity
          style={[styles.dangerButton, styles.cardShadow]}
          onPress={resetAllSettings}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.dangerButtonText}>Сбросить все настройки</Text>
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    paddingVertical: 12,
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTextWrapper: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 12,
    fontWeight: '400',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  blockListContainer: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  blockInputGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  blockInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  blockButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedUserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  blockedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  blockedUserName: {
    fontSize: 14,
    fontWeight: '600',
  },
  blockedUserDate: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  unblockButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  unblockButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cardShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});

export default SettingsScreen;
