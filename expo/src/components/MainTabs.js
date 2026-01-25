import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppState, View, ImageBackground } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useBackgroundImage } from '../contexts/BackgroundImageContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { profileAPI } from '../services/api';
import { subscribeToNewMessages } from '../services/globalNotifications';
import { getOrCreateSocket } from '../services/globalSocket';

import ChatsListScreen from '../screens/ChatsListScreen';
import PostsScreen from '../screens/PostsScreen';
import FriendsScreen from '../screens/FriendsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// Обёртки для экранов без фонового изображения
const PostsScreenWrapper = (props) => {
  const { setBackgroundImage } = useBackgroundImage();
  useFocusEffect(
    React.useCallback(() => {
      setBackgroundImage(null);
      return () => {};
    }, [setBackgroundImage])
  );
  return <PostsScreen {...props} />;
};

const FriendsScreenWrapper = (props) => {
  const { setBackgroundImage } = useBackgroundImage();
  useFocusEffect(
    React.useCallback(() => {
      setBackgroundImage(null);
      return () => {};
    }, [setBackgroundImage])
  );
  return <FriendsScreen {...props} />;
};

const ProfileScreenWrapper = (props) => {
  const { setBackgroundImage } = useBackgroundImage();
  useFocusEffect(
    React.useCallback(() => {
      setBackgroundImage(null);
      return () => {};
    }, [setBackgroundImage])
  );
  return <ProfileScreen {...props} />;
};

const MainTabs = () => {
  const { theme } = useTheme();
  const { backgroundImage, setBackgroundImage } = useBackgroundImage();
  const navigation = useNavigation();
  const { error: showError } = useModalAlert();
  const [unreadCount, setUnreadCount] = useState(0);

  // ✅ Получаем количество непрочитанных сообщений
  const getTotalUnread = async () => {
    try {
      const response = await fetch('http://151.247.196.66:3001/api/messages/unread', {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.counts) {
        const total = Object.values(data.counts).reduce((sum, count) => sum + count, 0);
        setUnreadCount(total > 99 ? 99 : total);
      }
    } catch (err) {
      console.log('Ошибка получения непрочитанных:', err);
    }
  };

  // ✅ Подписываемся на новые сообщения для обновления счетчика
  useEffect(() => {
    let unsubscribe;
    
    (async () => {
      // Загружаем начальное количество
      await getTotalUnread();
      
      // Подписываемся на новые сообщения
      unsubscribe = subscribeToNewMessages(async () => {
        await getTotalUnread();
      });
      
      // ✅ Подключаемся к Socket.io для обновления в реальном времени
      try {
        const socket = getOrCreateSocket();
        
        // Слушаем новые сообщения
        socket.on('new_message', async () => {
          console.log('📬 MainTabs: Новое сообщение, обновляем счетчик');
          await getTotalUnread();
        });
        
        // Слушаем обновление статуса прочтения (когда другой пользователь прочитал)
        socket.on('message_read_status_updated', async () => {
          console.log('✅ MainTabs: Статус прочтения обновлен, пересчитываем счетчик');
          await getTotalUnread();
        });
        
        // Слушаем уведомление о прочитанных сообщениях
        socket.on('messages_marked_read', async () => {
          console.log('📖 MainTabs: Сообщения отмечены как прочитанные, обновляем счетчик');
          await getTotalUnread();
        });
      } catch (err) {
        console.log('Ошибка подключения Socket в MainTabs:', err);
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ✅ Обновляем счетчик при переходе на вкладку "Чаты"
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      const state = e.data.state;
      if (state.index === 0) {  // Messages tab
        getTotalUnread();
      }
    });
    return unsubscribe;
  }, [navigation]);

  // ✅ Проверяем статус бана при монтировании и возврате из фона
  useEffect(() => {
    let subscription;
    
    const checkBanStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const response = await profileAPI.getProfile();
          
          if (response.data.is_banned) {
            console.log('⚠️ Пользователь забанен, выполняем выход');
            await AsyncStorage.multiRemove(['token', 'user', 'authToken', 'savedEmail', 'savedPassword']);
            
            showError(
              '🚫 Аккаунт заблокирован',
              `Ваш аккаунт был заблокирован администратором.\n\nПричина: ${response.data.ban_reason || 'Нарушение правил сообщества'}\n\nВы выполнили выход.`
            );
            
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          }
        }
      } catch (error) {
        console.log('Ошибка проверки статуса бана:', error);
      }
    };
    
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        checkBanStatus();
        // ✅ Обновляем счетчик непрочитанных при возврате из фона
        getTotalUnread();
      }
    };
    
    // Проверяем статус при монтировании
    checkBanStatus();
    
    // Подписываемся на изменения состояния приложения
    subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [navigation, showError]);
  
  return (
    <ImageBackground
      source={backgroundImage ? { uri: backgroundImage } : { uri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }}
      style={{ flex: 1, backgroundColor: theme.background }}
      imageStyle={{ opacity: backgroundImage ? 1 : 0 }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => ({
          sceneContainerStyle: {
            backgroundColor: 'transparent',
          },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          
          if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Posts') {
            iconName = focused ? 'newspaper' : 'newspaper-outline';
          } else if (route.name === 'Friends') {
            iconName = focused ? 'heart' : 'heart-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1.5,
          borderTopColor: theme.border,
          elevation: 15,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: theme.isDark ? 0.4 : 0.12,
          shadowRadius: 14,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          paddingHorizontal: 12,
          position: 'relative',
          borderRadius: 24,
          marginHorizontal: 8,
          marginBottom: 24,
          overflow: 'hidden',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 6,
          letterSpacing: 0.4,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Messages" 
        component={ChatsListScreen}
        options={{ 
          tabBarLabel: 'Чаты',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : null
        }}
      />
      <Tab.Screen 
        name="Posts" 
        component={PostsScreenWrapper}
        options={{ tabBarLabel: 'Посты' }}
      />
      <Tab.Screen 
        name="Friends" 
        component={FriendsScreenWrapper}
        options={{ tabBarLabel: 'Друзья' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreenWrapper}
        options={{ tabBarLabel: 'Профиль' }}
      />
      </Tab.Navigator>
    </ImageBackground>
  );
};

export default MainTabs;