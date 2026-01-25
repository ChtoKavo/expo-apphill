import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  SafeAreaView,
  RefreshControl,
  Dimensions,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import { friendAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FriendsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('friends');
  const [loading, setLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [onlineFriends, setOnlineFriends] = useState([]);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  const socketRef = useRef(null);
  const friendsRef = useRef([]);
  const subscribedUserIdsRef = useRef(new Set());
  const pendingSubscriptionsRef = useRef(new Set());
  const slideAnim = useRef(new Animated.Value(0)).current;

  const updateOnlineFriends = useCallback((friendsList) => {
    const accepted = Array.isArray(friendsList)
      ? friendsList.filter(friend => friend?.is_online)
      : [];
    setOnlineFriends(accepted);
  }, []);

  const applyStatusUpdate = useCallback((userId, isOnline) => {
    if (userId === undefined || userId === null) {
      return;
    }

    const normalizedId = String(userId);
    if (!normalizedId) {
      return;
    }

    const onlineFlag = !!isOnline;

    setFriends(prevFriends => {
      if (!Array.isArray(prevFriends) || prevFriends.length === 0) {
        return prevFriends;
      }

      let hasChanges = false;
      const updatedFriends = prevFriends.map(friend => {
        if (String(friend.id) === normalizedId) {
          if (friend.is_online === onlineFlag) {
            return friend;
          }
          hasChanges = true;
          return { ...friend, is_online: onlineFlag };
        }
        return friend;
      });

      if (hasChanges) {
        updateOnlineFriends(updatedFriends);
        return updatedFriends;
      }

      return prevFriends;
    });

    setPendingRequests(prevPending => {
      if (!Array.isArray(prevPending) || prevPending.length === 0) {
        return prevPending;
      }

      let hasChanges = false;
      const updatedPending = prevPending.map(request => {
        if (String(request.id) === normalizedId) {
          if (request.is_online === onlineFlag) {
            return request;
          }
          hasChanges = true;
          return { ...request, is_online: onlineFlag };
        }
        return request;
      });

      return hasChanges ? updatedPending : prevPending;
    });
  }, [updateOnlineFriends]);

  const subscribeToStatus = useCallback((friendIds = []) => {
    if (!Array.isArray(friendIds) || friendIds.length === 0) {
      return;
    }

    friendIds.forEach(idValue => {
      if (idValue === undefined || idValue === null) {
        return;
      }

      const normalizedId = String(idValue);
      if (!normalizedId) {
        return;
      }

      const numericId = Number(normalizedId);
      const payload = Number.isNaN(numericId) ? idValue : numericId;

      if (socketRef.current && socketRef.current.connected) {
        if (subscribedUserIdsRef.current.has(normalizedId)) {
          return;
        }
        try {
          socketRef.current.emit('subscribe_user_status', payload);
          subscribedUserIdsRef.current.add(normalizedId);
          pendingSubscriptionsRef.current.delete(normalizedId);
        } catch (err) {
          console.log('Ошибка подписки на статус пользователя', payload, err?.message || err);
        }
      } else {
        pendingSubscriptionsRef.current.add(normalizedId);
      }
    });
  }, []);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    const socketConnection = io('http://151.247.196.66:3001', {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socketConnection;

    socketConnection.on('connect', () => {
      console.log('FriendsScreen WebSocket connected');
      subscribedUserIdsRef.current.clear();

      const currentFriends = friendsRef.current || [];
      const friendIds = currentFriends
        .map(friend => friend.id)
        .filter(id => id !== undefined && id !== null);

      if (friendIds.length > 0) {
        subscribeToStatus(friendIds);
      }

      if (pendingSubscriptionsRef.current.size > 0) {
        const pendingIds = Array.from(pendingSubscriptionsRef.current);
        subscribeToStatus(pendingIds);
      }
    });

    socketConnection.on('user_status_changed', (data) => {
      const targetId = data?.userId ?? data?.user_id ?? data?.id;
      if (targetId === undefined || targetId === null) {
        return;
      }

      const statusValue = typeof data?.is_online === 'boolean'
        ? data.is_online
        : typeof data?.online === 'boolean'
          ? data.online
          : data?.status === 'online' || data?.status === 'В сети';

      applyStatusUpdate(targetId, !!statusValue);
    });

    socketConnection.on('user_online', (data) => {
      const targetId = data?.userId ?? data?.user_id ?? data?.id ?? data;
      if (targetId === undefined || targetId === null) {
        return;
      }
      applyStatusUpdate(targetId, true);
    });

    socketConnection.on('user_offline', (data) => {
      const targetId = data?.userId ?? data?.user_id ?? data?.id ?? data;
      if (targetId === undefined || targetId === null) {
        return;
      }
      applyStatusUpdate(targetId, false);
    });

    socketConnection.on('disconnect', () => {
      console.log('FriendsScreen WebSocket disconnected');
      subscribedUserIdsRef.current.clear();
    });

    socketConnection.on('connect_error', (error) => {
      console.log('Ошибка подключения WebSocket на FriendsScreen:', error?.message || error);
    });

    return () => {
      socketConnection.off('user_status_changed');
      socketConnection.off('user_online');
      socketConnection.off('user_offline');
      socketConnection.off('disconnect');
      socketConnection.off('connect_error');
      socketConnection.disconnect();
      socketRef.current = null;
      subscribedUserIdsRef.current.clear();
      pendingSubscriptionsRef.current.clear();
    };
  }, [applyStatusUpdate, subscribeToStatus]);

  const loadFriends = useCallback(async () => {
    try {
      const response = await friendAPI.getFriends();
      const rawFriends = Array.isArray(response.data) ? response.data : [];
      const normalizedFriends = rawFriends
        .filter(friend => friend && typeof friend === 'object')
        .map(friend => ({
          id: friend.id,
          username: friend.username || friend.name || 'Пользователь',
          email: friend.email || '',
          avatar: friend.avatar || null,
          status: friend.status || 'accepted',
          is_online: !!friend.is_online,
          ...friend,
        }));
      
      const acceptedFriends = normalizedFriends.filter(f => f.status === 'accepted');
      const pending = normalizedFriends.filter(f => f.status === 'pending');

      setFriends(acceptedFriends);
      setPendingRequests(pending);
      updateOnlineFriends(acceptedFriends);

      const acceptedIds = acceptedFriends
        .map(friend => friend.id)
        .filter(id => id !== undefined && id !== null);

      const acceptedIdsSet = new Set(acceptedIds.map(id => String(id)));

      Array.from(subscribedUserIdsRef.current).forEach(id => {
        if (!acceptedIdsSet.has(id)) {
          subscribedUserIdsRef.current.delete(id);
        }
      });

      Array.from(pendingSubscriptionsRef.current).forEach(id => {
        if (!acceptedIdsSet.has(id)) {
          pendingSubscriptionsRef.current.delete(id);
        }
      });

      if (acceptedIds.length > 0) {
        subscribeToStatus(acceptedIds);
      }
    } catch (error) {
      console.error('Ошибка загрузки друзей:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить список друзей');
    }
  }, [subscribeToStatus, updateOnlineFriends]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const loadSuggestedUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await friendAPI.searchUsers('');
      const rawUsers = Array.isArray(response.data) ? response.data : [];
      const normalizedUsers = rawUsers
        .filter(user => user && typeof user === 'object')
        .map(user => ({
          id: user.id,
          username: user.username || user.name || 'Пользователь',
          email: user.email || '',
          status: user.status || '',
          avatar: user.avatar || null,
          friend_status: user.friend_status || null,
          ...user,
        }));
      setSearchResults(normalizedUsers.filter(user => 
        !friends.some(friend => friend.id === user.id) && 
        !pendingRequests.some(request => request.id === user.id)
      ));
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
    }
  }, [friends, pendingRequests]);

  useEffect(() => {
    if (activeTab === 'search') {
      loadSuggestedUsers();
    }
  }, [activeTab, loadSuggestedUsers]);

  const searchUsers = async (query) => {
    const trimmed = (query || '').trim();
    if (trimmed.length > 0 && trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await friendAPI.searchUsers(trimmed ? encodeURIComponent(trimmed) : '');
      const rawUsers = Array.isArray(response.data) ? response.data : [];
      const normalizedUsers = rawUsers
        .filter(user => user && typeof user === 'object')
        .map(user => ({
          id: user.id,
          username: user.username || user.name || 'Пользователь',
          email: user.email || '',
          avatar: user.avatar || null,
          friend_status: user.friend_status || null,
          ...user,
        }));
      const filteredResults = normalizedUsers.filter(user => 
        (!trimmed || user.username.toLowerCase().includes(trimmed.toLowerCase())) &&
        !friends.some(friend => friend.id === user.id) &&
        !pendingRequests.some(request => request.id === user.id)
      );
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Ошибка поиска:', error);
      Alert.alert('Ошибка', 'Не удалось выполнить поиск');
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (userId) => {
    try {
      const response = await friendAPI.sendFriendRequest(userId);
      Alert.alert('Успех', 'Заявка в друзья отправлена');
      setSearchResults(prevResults => 
        prevResults.map(user => 
          user.id === userId 
            ? { ...user, friend_status: 'outgoing' }
            : user
        )
      );
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Не удалось отправить заявку';
      Alert.alert('Ошибка', errorMessage);
    }
  };

  const acceptFriend = async (userId) => {
    try {
      await friendAPI.acceptFriend(userId);
      Alert.alert('Успех', 'Заявка принята');
      loadFriends();
      if (searchQuery) {
        searchUsers(searchQuery);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось принять заявку');
    }
  };

  const removeFriend = async (userId) => {
    Alert.alert(
      'Удалить из друзей',
      'Вы уверены?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await friendAPI.removeFriend(userId);
              Alert.alert('Успех', 'Удалено из друзей');
              loadFriends();
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить из друзей');
            }
          },
        },
      ]
    );
  };

  const openFriendOptions = useCallback((friend) => {
    setSelectedFriend(friend);
    setOptionsModalVisible(true);
    panY.setValue(0);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [slideAnim, panY]);

  const closeFriendOptions = useCallback(() => {
    panY.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setOptionsModalVisible(false);
      setSelectedFriend(null);
    });
  }, [slideAnim, panY]);

  const handleOpenChat = useCallback(() => {
    if (selectedFriend) {
      closeFriendOptions();
      navigation.navigate('Chat', { user: selectedFriend });
    }
  }, [selectedFriend, closeFriendOptions, navigation]);

  const handleViewProfile = useCallback(() => {
    if (selectedFriend) {
      closeFriendOptions();
      navigation.navigate('UserProfile', { user: selectedFriend });
    }
  }, [selectedFriend, closeFriendOptions, navigation]);

  const handleRemoveFriend = useCallback(() => {
    if (selectedFriend) {
      closeFriendOptions();
      removeFriend(selectedFriend.id);
    }
  }, [selectedFriend, closeFriendOptions]);

  const panY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        panY.setOffset(0);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset();
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(panY, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            closeFriendOptions();
            panY.setValue(0);
          });
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const renderFriend = ({ item }) => (
    <View style={styles.friendItemWrapper}>
      <TouchableOpacity
        style={[styles.friendItem, { backgroundColor: theme.surface }]}
        activeOpacity={0.6}
        onPress={() => navigation.navigate('Chat', { user: item })}
      >
        {/* Аватарка слева */}
        <View style={styles.avatarWrapper}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.smallAvatar} />
          ) : (
            <View style={[styles.smallAvatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.smallAvatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
          )}
          {item.is_online && (
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
            </View>
          )}
        </View>

        {/* Основная информация */}
        <View style={styles.friendDetails}>
          <View style={styles.nameRow}>
            <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
              {item.username}
            </Text>
            {item.is_online && (
              <View style={styles.onlineTag}>
                <Text style={styles.onlineTagText}>Online</Text>
              </View>
            )}
          </View>
          <Text style={[styles.lastSeenText, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.is_online ? 'Active now' : 'Last seen recently'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Кнопки действия - минималистичные */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickButton, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('Chat', { user: item })}
        >
          <Ionicons name="chatbubble" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.primary }]}
          onPress={() => openFriendOptions(item)}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPendingRequest = ({ item }) => (
    <View style={[styles.requestCard, { backgroundColor: theme.surface }]}>
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.requestInfo}>
        <Text style={[styles.requestName, { color: theme.text }]}>{item.username}</Text>
        <Text style={[styles.requestText, { color: theme.textSecondary }]}>Хочет добавить вас в друзья</Text>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={styles.acceptRequestButton}
          onPress={() => acceptFriend(item.id)}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineRequestButton}
          onPress={() => removeFriend(item.id)}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSearchResult = ({ item }) => {
    const getButtonContent = () => {
      switch (item.friend_status) {
        case 'accepted':
          return { icon: 'checkmark-circle', color: '#34C759', disabled: true };
        case 'pending':
          return { icon: 'time', color: '#FF9500', disabled: true, text: 'Входящая заявка' };
        case 'outgoing':
          return { icon: 'time', color: '#60A5FA', disabled: true, text: 'Заявка отправлена' };
        default:
          return { icon: 'person-add', color: '#60A5FA', disabled: false, action: () => sendFriendRequest(item.id) };
      }
    };

    const buttonContent = getButtonContent();

    return (
      <View style={[styles.searchCard, { backgroundColor: theme.surface }]}>
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.searchInfo}>
          <Text style={[styles.searchName, { color: theme.text }]}>{item.username}</Text>
          <Text style={[styles.searchStatus, { color: theme.textSecondary }]}>
            {item.status ? item.status : 'Статус не указан'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.actionButton, { opacity: buttonContent.disabled ? 0.5 : 1 }]}
          onPress={buttonContent.action}
          disabled={buttonContent.disabled}
        >
          <Ionicons name={buttonContent.icon} size={24} color={buttonContent.color} />
        </TouchableOpacity>
      </View>
    );
  };


  const renderContent = () => {
    const trimmedSearch = (searchQuery || '').trim();
    switch (activeTab) {
      case 'friends':
        return (
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFriends} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>У вас пока нет друзей</Text>
                <Text style={styles.emptySubtext}>Найдите друзей во вкладке "Поиск"</Text>
              </View>
            }
          />
        );
      case 'requests':
        return (
          <FlatList
            data={pendingRequests}
            renderItem={renderPendingRequest}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFriends} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>Нет заявок в друзья</Text>
              </View>
            }
          />
        );
      case 'search':
        return (
          <>
            <View style={[styles.searchContainer, { backgroundColor: theme.surface, borderColor: 'rgba(255, 149, 0, 0.15)' }]}>
              <Ionicons name="search" size={20} color={'#60A5FA'} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  searchUsers(text);
                }}
                placeholder="Поиск пользователей..."
                placeholderTextColor={theme.textLight}
              />
            </View>
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSuggestedUsers} />}
              ListHeaderComponent={
                !searchQuery && searchResults.length > 0 ? (
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Рекомендуемые пользователи</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                trimmedSearch.length > 0 && trimmedSearch.length < 2 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="information-circle-outline" size={48} color="#ccc" />
                    <Text style={[styles.emptyText, { color: theme.textSecondary, textAlign: 'center' }]}>
                      Введите минимум 2 символа для поиска
                    </Text>
                  </View>
                ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={64} color={'#60A5FA'} />
                  <Text style={[styles.emptyText, { color: theme.text }]}>Пользователи не найдены</Text>
                  <TouchableOpacity onPress={loadSuggestedUsers} style={[styles.reloadButton, { backgroundColor: 'rgba(96, 165, 250, 0.15)', borderColor: '#60A5FA', borderWidth: 1.5 }]}>
                    <Text style={[styles.reloadButtonText, { color: '#60A5FA' }]}>Обновить список</Text>
                  </TouchableOpacity>
                </View>
                )
              }
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Друзья</Text>
          <View style={styles.headerStats}>
            <Text style={[styles.statsText, { color: theme.textSecondary }]}>{friends.length}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'friends' && styles.activeTab
          ]}
          onPress={() => setActiveTab('friends')}
        >
          <Ionicons 
            name="people" 
            size={20} 
            color={activeTab === 'friends' ? theme.primary : theme.textSecondary} 
          />
          <Text 
            style={[
              styles.tabText,
              { color: activeTab === 'friends' ? theme.primary : theme.textSecondary },
              activeTab === 'friends' && styles.activeTabText
            ]}>
            Друзья
          </Text>
          {onlineFriends.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{onlineFriends.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <Ionicons 
            name="mail" 
            size={20} 
            color={activeTab === 'requests' ? theme.primary : theme.textSecondary} 
          />
          <Text 
            style={[
              styles.tabText,
              { color: activeTab === 'requests' ? theme.primary : theme.textSecondary },
              activeTab === 'requests' && styles.activeTabText
            ]}>
            Заявки
          </Text>
          {pendingRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab, activeTab === 'search' && { backgroundColor: 'rgba(96, 165, 250, 0.15)', borderBottomColor: '#60A5FA' }]}
          onPress={() => setActiveTab('search')}
        >
          <Ionicons 
            name="search" 
            size={20} 
            color={activeTab === 'search' ? '#60A5FA' : theme.textSecondary} 
          />
          <Text 
            style={[
              styles.tabText,
              { color: activeTab === 'search' ? '#FF9500' : theme.textSecondary },
              activeTab === 'search' && styles.activeTabText
            ]}>
            Поиск
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>

      <Modal
        visible={optionsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeFriendOptions}
      >
        <View style={styles.modalWrapper}>
          <TouchableWithoutFeedback onPress={closeFriendOptions}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.optionsSheet,
              {
                backgroundColor: theme.surface,
                transform: [
                  {
                    translateY: Animated.add(
                      slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [400, 0],
                      }),
                      panY
                    ),
                  },
                ],
                opacity: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {selectedFriend?.username || 'Пользователь'}
            </Text>
            {selectedFriend?.status && (
              <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                {selectedFriend.status === 'accepted' ? 'В друзьях' : selectedFriend.status}
              </Text>
            )}
            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.optionButton} onPress={handleOpenChat}>
                <View style={[styles.optionIconWrapper, { backgroundColor: 'rgba(102, 126, 234, 0.12)' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color="#60A5FA" />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionText, { color: theme.text }]}>Написать сообщение</Text>
                  <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                    Открыть чат с пользователем
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionButton} onPress={handleViewProfile}>
                <View style={[styles.optionIconWrapper, { backgroundColor: 'rgba(52, 199, 89, 0.12)' }]}>
                  <Ionicons name="person-circle-outline" size={22} color="#34C759" />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionText, { color: theme.text }]}>Посмотреть профиль</Text>
                  <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                    Просмотреть информацию пользователя
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.optionButton, styles.optionDanger]} onPress={handleRemoveFriend}>
                <View style={[styles.optionIconWrapper, { backgroundColor: 'rgba(255, 59, 48, 0.12)' }]}>
                  <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionDangerText}>Удалить из друзей</Text>
                  <Text style={[styles.optionDescription, styles.optionDangerDescription]}>
                    Удалить пользователя из списка друзей
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={closeFriendOptions}>
              <Text style={styles.closeButtonText}>Отмена</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 18,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerStats: {
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  statsText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#667eea',
    letterSpacing: -0.3,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 18,
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  activeTab: {
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  tabText: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '600',
  },
  activeTabText: {
    fontWeight: '700',
    color: '#667eea',
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    elevation: 2,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 18,
    height: 50,
    backgroundColor: 'rgba(255, 149, 0, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 149, 0, 0.15)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  friendItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  friendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  avatarWrapper: {
    position: 'relative',
  },
  smallAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#667eea',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  smallAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    elevation: 2,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  friendDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  onlineTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  onlineTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4CAF50',
  },
  lastSeenText: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  requestCard: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.2)',
    elevation: 2,
    shadowColor: '#ff9500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  requestInfo: {
    flex: 1,
    marginLeft: 14,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 3,
  },
  requestText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptRequestButton: {
    backgroundColor: '#34C759',
    borderRadius: 18,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  declineRequestButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 18,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  searchCard: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(102, 126, 234, 0.15)',
    backgroundColor: 'rgba(102, 126, 234, 0.05)',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  searchInfo: {
    flex: 1,
    marginLeft: 14,
  },
  searchName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 3,
  },
  searchStatus: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  actionButton: {
    padding: 10,
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  optionsSheet: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  sheetButtons: {
    marginBottom: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.05)',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.1)',
    elevation: 1,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  optionIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  optionInfo: {
    flex: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    fontWeight: '500',
  },
  optionDanger: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  optionDangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
  },
  optionDangerDescription: {
    color: '#FF3B30',
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  reloadButton: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF9500',
  },
  reloadButtonText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default FriendsScreen;