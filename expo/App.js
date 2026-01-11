import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from './src/services/api';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import ChatScreen from './src/screens/ChatScreen';
import GroupChatScreen from './src/screens/GroupChatScreen';
import CreateGroupScreen from './src/screens/CreateGroupScreen';
import CommentsScreen from './src/screens/CommentsScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import AdminPanelScreen from './src/screens/AdminPanelScreen';
import AdminPostReportsScreen from './src/screens/AdminPostReportsScreen';
import CommunitiesScreen from './src/screens/CommunitiesScreen';
import CommunityDetail from './src/screens/CommunityDetail';
import MainTabs from './src/components/MainTabs';
import NotificationSettings from './src/components/NotificationSettings';
import UserProfileScreen from './src/screens/UserProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import useNotifications from './src/hooks/useNotifications';
import useNotificationsWithReply, { setNavigationRef } from './src/hooks/useNotificationsWithReply';
import useAppState from './src/hooks/useAppState';
import { initializeGlobalNotifications } from './src/services/globalNotifications';
import { initializeOnlineStatus, disconnectOnlineStatus } from './src/services/onlineStatus';
import { registerBackgroundFetch, unregisterBackgroundFetch } from './src/services/backgroundTasks';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { ModalAlertProvider } from './src/contexts/ModalAlertContext';
import ReplyToNotificationModal from './src/components/ReplyToNotificationModal';

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = React.useState('Login');
  const [isLoading, setIsLoading] = React.useState(true);
  const navigationRef = React.useRef();
  
  // Инициализация уведомлений и статуса
  useNotifications();
  
  // 🆕 Инициализация уведомлений с функцией ответа
  const {
    replyModalVisible,
    setReplyModalVisible,
    replyData,
    replyMessage,
    setReplyMessage,
    isSending,
    handleSendReply,
    handleNotificationPress
  } = useNotificationsWithReply();
  
  useAppState();
  
  // 🆕 Обработка клика по уведомлению для открытия чата
  React.useEffect(() => {
    const checkPendingNotification = async () => {
      const pending = await AsyncStorage.getItem('pendingNotificationChat');
      if (pending) {
        try {
          const chatData = JSON.parse(pending);
          console.log('📱 Открываем чат из уведомления:', chatData);
          
          // Очищаем флаг
          await AsyncStorage.removeItem('pendingNotificationChat');
          
          // Открываем чат с отправителем
          if (navigationRef.current) {
            navigationRef.current.navigate('Chat', {
              user: { id: chatData.senderId, name: chatData.senderName },
              focusInput: chatData.focusInput
            });
          }
        } catch (error) {
          console.error('❌ Ошибка обработки уведомления:', error);
        }
      }
    };

    // Проверяем при инициализации
    checkPendingNotification();
    
    // Также проверяем каждые 500ms на случай если приложение еще загружается
    const interval = setInterval(checkPendingNotification, 500);
    return () => clearInterval(interval);
  }, []);
  
  React.useEffect(() => {
    const checkSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('savedEmail');
        const savedPassword = await AsyncStorage.getItem('savedPassword');
        
        if (savedEmail && savedPassword) {
          try {
            const response = await authAPI.login({ email: savedEmail, password: savedPassword });
            
            // ✅ НОВОЕ: Проверяем, не забанен ли пользователь
            if (response.data.user?.is_banned) {
              console.log('⚠️ Пользователь забанен, переводим на логин');
              // Очищаем сохраненные данные
              await AsyncStorage.multiRemove(['savedEmail', 'savedPassword', 'token', 'user', 'authToken']);
              setInitialRoute('Login');
            } else {
              await AsyncStorage.setItem('token', response.data.token);
              await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
              setInitialRoute('Main');
            }
          } catch (error) {
            console.log('Ошибка автоматического входа:', error);
            // Если ошибка 403 (забан при входе)
            if (error.response?.status === 403) {
              await AsyncStorage.multiRemove(['savedEmail', 'savedPassword', 'token', 'user', 'authToken']);
            }
          }
        }
      } catch (error) {
        console.error('Ошибка при проверке сохраненных данных:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSavedCredentials();
    initializeGlobalNotifications();
    initializeOnlineStatus();
    registerBackgroundFetch();
    // Скрыть статусбар и по возможности навигационную панель на Android
    try {
      // Статусбар скрывается через компонент ниже; для Android попробуем динамически импортировать
      if (Platform.OS === 'android') {
        import('expo-navigation-bar')
          .then(NavigationBar => {
            if (NavigationBar && NavigationBar.setVisibilityAsync) {
              NavigationBar.setVisibilityAsync('hidden');
            }
            if (NavigationBar && NavigationBar.setBehaviorAsync) {
              // Поведение overlay-swipe позволит показывать панель жестом
              NavigationBar.setBehaviorAsync('overlay-swipe');
            }
          })
          .catch(err => console.log('expo-navigation-bar не установлен или недоступен:', err));
      }
    } catch (e) {
      console.log('Ошибка при попытке скрыть навигационную панель:', e);
    }
    
    return () => {
      disconnectOnlineStatus();
      unregisterBackgroundFetch();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a1428' }}>
        <ActivityIndicator size="large" color="#FF9500" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <ModalAlertProvider>
        {/* Скрываем статусбар приложения */}
        <StatusBar hidden />
        <NavigationContainer 
          ref={(ref) => {
            navigationRef.current = ref;
            // 🆕 Передаем navigationRef в хук для push-уведомлений
            setNavigationRef(ref);
          }}
        >
          <Stack.Navigator 
            initialRouteName={initialRoute} 
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
            <Stack.Screen name="AdminPostReports" component={AdminPostReportsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="GroupChat" component={GroupChatScreen} />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
            <Stack.Screen name="Comments" component={CommentsScreen} />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} />
            <Stack.Screen name="Communities" component={CommunitiesScreen} />
            <Stack.Screen name="CommunityDetail" component={CommunityDetail} />
            <Stack.Screen 
              name="NotificationSettings" 
              component={NotificationSettings}
              options={{ headerShown: true, title: 'Настройки уведомлений' }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        
        {/* 🆕 Модальное окно для ответа на сообщение из уведомления */}
        <ReplyToNotificationModal
          visible={replyModalVisible}
          onClose={() => {
            setReplyModalVisible(false);
            setReplyMessage('');
          }}
          replyData={replyData}
          replyMessage={replyMessage}
          setReplyMessage={setReplyMessage}
          onSendReply={handleSendReply}
          onOpenChat={handleNotificationPress}
          isSending={isSending}
        />
      </ModalAlertProvider>
    </ThemeProvider>
  );
}