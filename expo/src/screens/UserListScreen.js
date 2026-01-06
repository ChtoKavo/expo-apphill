import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { userAPI, groupAPI, messageAPI } from '../services/api';
import { initializeOnlineStatus, getStatusSocket, disconnectOnlineStatus } from '../services/onlineStatus';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const UserListScreen = ({ navigation }) => {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('chats');
  const [lastMessages, setLastMessages] = useState({});
  const [groupLastMessages, setGroupLastMessages] = useState({});

  useEffect(() => {
    loadUsers();
    loadGroups();
    setupOnlineStatus();
    
    return () => {
      disconnectOnlineStatus();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadGroups();
    }, [])
  );

  const setupOnlineStatus = async () => {
    const socket = await initializeOnlineStatus();
    if (socket) {
      socket.on('user_status_changed', (data) => {
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === data.userId 
              ? { ...user, is_online: data.isOnline }
              : user
          )
        );
        setFilteredUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === data.userId 
              ? { ...user, is_online: data.isOnline }
              : user
          )
        );
      });
    }
  };

  const loadUsers = async () => {
    try {
      const response = await userAPI.getUsers();
      setUsers(response.data);
      setFilteredUsers(response.data);
      loadLastMessages(response.data);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      if (error.response?.status === 401) {
        Alert.alert('Ошибка', 'Сессия истекла. Войдите снова', [
          { text: 'OK', onPress: () => navigation.replace('Login') }
        ]);
      } else {
        Alert.alert('Ошибка', 'Не удалось загрузить список пользователей');
      }
    }
  };

  const loadGroups = async () => {
    try {
      const response = await groupAPI.getGroups();
      setGroups(response.data);
      loadGroupLastMessages(response.data);
    } catch (error) {
      console.error('Ошибка загрузки групп:', error);
    }
  };

  const loadLastMessages = async (usersList) => {
    const messages = {};
    for (const user of usersList) {
      try {
        const response = await messageAPI.getMessages(user.id);
        const lastMsg = response.data[response.data.length - 1];
        if (lastMsg) {
          messages[user.id] = lastMsg.message;
        }
      } catch (error) {
        console.log(`Ошибка загрузки сообщений для ${user.username}`);
      }
    }
    setLastMessages(messages);
  };

  const loadGroupLastMessages = async (groupsList) => {
    const messages = {};
    for (const group of groupsList) {
      try {
        const response = await groupAPI.getGroupMessages(group.id);
        const lastMsg = response.data[response.data.length - 1];
        if (lastMsg) {
          messages[group.id] = {
            message: lastMsg.message,
            sender: lastMsg.sender_username || 'Пользователь'
          };
        }
      } catch (error) {
        console.log(`Ошибка загрузки сообщений для группы ${group.name}`);
      }
    }
    setGroupLastMessages(messages);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user => 
        user.username.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  };

  const handleLogout = async () => {
    disconnectOnlineStatus();
    // Очищаем данные текущего пользователя, но сохраняем пины (они по-прежнему могут быть полезны при переходе между аккаунтами)
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    // Полностью очищаем пины при выходе, чтобы при входе на новый аккаунт они не наследовались
    await AsyncStorage.removeItem('pinnedChats');
    navigation.replace('Login');
  };

  const banUser = async (userId) => {
    Alert.alert('Забанить пользователя?', 'Вы точно хотите забанить этого пользователя?', [
      { text: 'Отмена', style: 'cancel' },
      { 
        text: 'Да, забанить', 
        style: 'destructive',
        onPress: async () => {
          try {
            await userAPI.banUser(userId);
            Alert.alert('Успех', 'Пользователь успешно забанен');
            loadUsers();
          } catch (error) {
            Alert.alert('Ошибка', 'Не удалось забанить пользователя');
          }
        }
      }
    ]);
  };

  const renderUser = ({ item }) => (
    <View style={[styles.userItem, { backgroundColor: theme.surface }]}>
      <TouchableOpacity
        style={styles.userTouchable}
        onPress={() => navigation.navigate('Chat', { user: item })}
      >
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={[styles.onlineIndicator, { backgroundColor: item.is_online ? '#34C759' : '#8E8E93' }]} />
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.username, { color: theme.text }]}>{item.username}</Text>
          {lastMessages[item.id] ? (
            <Text style={[styles.lastMessage, { color: theme.textSecondary }]} numberOfLines={1}>
              {lastMessages[item.id]}
            </Text>
          ) : (
            <Text style={[styles.status, { color: item.is_online ? theme.success : theme.textLight }]}>
              {item.is_online ? 'В сети' : 'Не в сети'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.banButton}
        onPress={() => banUser(item.id)}
      >
        <Ionicons name="ban" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderGroup = ({ item }) => (
    <TouchableOpacity
      style={[styles.userItem, { backgroundColor: theme.surface }]}
      onPress={() => navigation.navigate('GroupChat', { group: item })}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.groupAvatarPlaceholder}>
            <Ionicons name="people" size={24} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={[styles.username, { color: theme.text }]}>{item.name}</Text>
        {groupLastMessages[item.id] ? (
          <Text style={[styles.lastMessage, { color: theme.textSecondary }]} numberOfLines={1}>
            {groupLastMessages[item.id].sender}: {groupLastMessages[item.id].message}
          </Text>
        ) : (
          <Text style={[styles.status, { color: theme.textSecondary }]}>
            {item.description || `${item.member_count || 0} участников`}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={["top","bottom"]} style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={theme.gradient}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.title}>💬 Чаты</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
              <Ionicons name={isDark ? "sunny" : "moon"} size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => navigation.navigate('CreateGroup')} 
              style={styles.createGroupButton}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск пользователей..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={handleSearch}
          />
        </View>
      </LinearGradient>
      
      <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === 'chats' && styles.activeTabText]}>
            Личные
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
          onPress={() => setActiveTab('groups')}
        >
          <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === 'groups' && styles.activeTabText]}>
            Группы
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'chats' ? filteredUsers : groups}
        renderItem={activeTab === 'chats' ? renderUser : renderGroup}
        keyExtractor={(item) => `${activeTab}-${item.id}`}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeButton: {
    padding: 8,
    marginRight: 10,
  },
  createGroupButton: {
    padding: 8,
    marginRight: 10,
  },
  logoutButton: {
    padding: 8,
  },
  tabs: {
    flexDirection: 'row',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#667eea',
  },
  groupAvatarPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  list: {
    flex: 1,
    paddingTop: 10,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 15,
    marginVertical: 5,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
  },
  avatarPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  status: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '500',
  },
  lastMessage: {
    fontSize: 14,
    marginTop: 2,
  },
  messageInfo: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default UserListScreen;