import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { communitiesAPI } from '../services/api';
import { getOrCreateSocket } from '../services/globalSocket';

// Вспомогательная функция для безопасной обработки URI
const getImageUri = (uri) => {
  if (!uri) return null;
  if (typeof uri === 'string') return uri;
  if (typeof uri === 'object' && uri.uri && typeof uri.uri === 'string') return uri.uri;
  return null;
};
const { width } = Dimensions.get('window');

const CommunityDetail = ({ route, navigation }) => {
  const { communityId } = route.params;
  const { theme } = useTheme();
  const { showError, showSuccess } = useModalAlert();

  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'members', 'posts'
  const [isJoining, setIsJoining] = useState(false);

  const loadCommunityDetail = async () => {
    try {
      setLoading(true);
      
      const response = await communitiesAPI.getCommunity(communityId);
      
      if (response?.data) {
        const communityData = response.data;
        setCommunity(communityData);
        setIsMember(communityData.is_member || false);

        const membersResponse = await communitiesAPI.getMembers(communityId);
        setMembers(membersResponse?.data || []);

        const postsResponse = await communitiesAPI.getPosts(communityId);
        setPosts(postsResponse?.data || []);
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки детали:', error.message);
      showError('Ошибка', 'Не удалось загрузить сообщество');
    } finally {
      setLoading(false);
    }
  };

  // Загружаем при монтировании
  useEffect(() => {
    loadCommunityDetail();
  }, [communityId]);

  // Подписываемся на обновления через Socket.io
  useEffect(() => {
    let socket = null;

    const setupSocketListeners = async () => {
      try {
        socket = await getOrCreateSocket();
        
        if (!socket?.connected) {
          return;
        }

        // Слушаем обновления членов
        socket.on(`community_${communityId}_member_joined`, (data) => {
          setMembers(prev => [...prev, data.member]);
          if (community) {
            setCommunity(prev => ({
              ...prev,
              members_count: (prev.members_count || 0) + 1
            }));
          }
        });

        socket.on(`community_${communityId}_member_left`, (data) => {
          setMembers(prev => prev.filter(m => m.id !== data.member_id));
          if (community) {
            setCommunity(prev => ({
              ...prev,
              members_count: Math.max(0, (prev.members_count || 0) - 1)
            }));
          }
        });

        // Слушаем новые посты
        socket.on(`community_${communityId}_new_post`, (data) => {
          setPosts(prev => [data.post, ...prev]);
          if (community) {
            setCommunity(prev => ({
              ...prev,
              posts_count: (prev.posts_count || 0) + 1
            }));
          }
        });
      } catch (error) {
        console.error('❌ Ошибка подключения Socket.io:', error.message);
      }
    };

    setupSocketListeners();

    return () => {
      if (socket) {
        socket.off(`community_${communityId}_member_joined`);
        socket.off(`community_${communityId}_member_left`);
        socket.off(`community_${communityId}_new_post`);
      }
    };
  }, [communityId, community]);

  // Присоединиться к сообществу
  const handleJoinCommunity = async () => {
    try {
      setIsJoining(true);
      const response = await communitiesAPI.joinCommunity(communityId);
      
      if (response.data) {
        setIsMember(true);
        showSuccess('Успешно!', 'Вы присоединились к сообществу');
        
        // Обновляем счетчик членов
        if (community) {
          setCommunity(prev => ({
            ...prev,
            members_count: (prev.members_count || 0) + 1
          }));
        }
      }
    } catch (error) {
      console.error('❌ Ошибка присоединения:', error.message);
      showError('Ошибка', 'Не удалось присоединиться к сообществу');
    } finally {
      setIsJoining(false);
    }
  };

  // Покинуть сообщество
  const handleLeaveCommunity = async () => {
    Alert.alert(
      'Подтверждение',
      'Вы уверены, что хотите покинуть это сообщество?',
      [
        { text: 'Отмена', onPress: () => {} },
        {
          text: 'Покинуть',
          onPress: async () => {
            try {
              setIsJoining(true);
              await communitiesAPI.leaveCommunity(communityId);
              setIsMember(false);
              showSuccess('Успешно!', 'Вы вышли из сообщества');
              
              if (community) {
                setCommunity(prev => ({
                  ...prev,
                  members_count: Math.max(0, (prev.members_count || 0) - 1)
                }));
              }
            } catch (error) {
              console.error('❌ Ошибка выхода:', error.message);
              showError('Ошибка', 'Не удалось покинуть сообщество');
            } finally {
              setIsJoining(false);
            }
          },
        }
      ]
    );
  };

  // Обновить данные
  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommunityDetail();
    setRefreshing(false);
  };

  // Рендер загрузки
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!community) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: theme.text }]}>
            Сообщество не найдено
          </Text>
          <TouchableOpacity 
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Вернуться</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Заголовок */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {community.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Баннер сообщества */}
        {getImageUri(community.banner_url) && (
          <Image
            source={{ uri: getImageUri(community.banner_url) }}
            style={styles.banner}
          />
        )}

        {/* Информация о сообществе */}
        <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.communityName, { color: theme.text }]}>
            {community.name}
          </Text>
          {community.description && (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {community.description}
            </Text>
          )}

          {/* Статистика */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.primary }]}>
                {community.members_count || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Членов
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.primary }]}>
                {community.posts_count || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Постов
              </Text>
            </View>
          </View>

          {/* Кнопка присоединения/выхода */}
          <TouchableOpacity
            style={[
              styles.joinButton,
              {
                backgroundColor: isMember ? theme.surfaceVariant : theme.primary,
                borderColor: isMember ? theme.primary : 'transparent',
                borderWidth: isMember ? 1 : 0,
              }
            ]}
            onPress={isMember ? handleLeaveCommunity : handleJoinCommunity}
            disabled={isJoining}
          >
            {isJoining ? (
              <ActivityIndicator color={isMember ? theme.primary : '#fff'} />
            ) : (
              <Text style={[
                styles.joinButtonText,
                { color: isMember ? theme.primary : '#fff' }
              ]}>
                {isMember ? 'Выйти из сообщества' : 'Присоединиться'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Вкладки */}
        <View style={[styles.tabsContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'info' && [styles.activeTab, { borderBottomColor: theme.primary }]
            ]}
            onPress={() => setActiveTab('info')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'info' ? theme.primary : theme.textSecondary }
            ]}>
              Информация
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'members' && [styles.activeTab, { borderBottomColor: theme.primary }]
            ]}
            onPress={() => setActiveTab('members')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'members' ? theme.primary : theme.textSecondary }
            ]}>
              Члены
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'posts' && [styles.activeTab, { borderBottomColor: theme.primary }]
            ]}
            onPress={() => setActiveTab('posts')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'posts' ? theme.primary : theme.textSecondary }
            ]}>
              Посты
            </Text>
          </TouchableOpacity>
        </View>

        {/* Содержимое вкладок */}
        <View style={styles.tabContent}>
          {activeTab === 'info' && community.rules && (
            <View style={[styles.rulesCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.rulesTitle, { color: theme.text }]}>📋 Правила</Text>
              <Text style={[styles.rulesText, { color: theme.textSecondary }]}>
                {community.rules}
              </Text>
            </View>
          )}

          {activeTab === 'members' && (
            <FlatList
              data={members}
              keyExtractor={(item) => item.id?.toString()}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.memberItem, { backgroundColor: theme.surface }]}
                  onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
                >
                  {getImageUri(item.avatar_url) && (
                    <Image
                      source={{ uri: getImageUri(item.avatar_url) }}
                      style={styles.memberAvatar}
                    />
                  )}
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: theme.text }]}>
                      {item.username || item.name}
                    </Text>
                    {item.role && (
                      <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                        {item.role === 'admin' ? '👑 Администратор' : 'Член'}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Нет членов
                </Text>
              }
            />
          )}

          {activeTab === 'posts' && (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id?.toString()}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.postItem, { backgroundColor: theme.surface }]}
                  onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
                >
                  <Text style={[styles.postTitle, { color: theme.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.content && (
                    <Text
                      style={[styles.postContent, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {item.content}
                    </Text>
                  )}
                  <Text style={[styles.postMeta, { color: theme.textSecondary }]}>
                    {item.likes_count || 0} ❤️ {item.comments_count || 0} 💬
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Нет постов
                </Text>
              }
            />
          )}
        </View>
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
    elevation: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 8,
  },
  banner: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  infoCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
  },
  communityName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#e0e0e0',
    borderBottomColor: '#e0e0e0',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  joinButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabContent: {
    padding: 16,
  },
  rulesCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  rulesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberRole: {
    fontSize: 12,
    marginTop: 2,
  },
  postItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  postTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  postContent: {
    fontSize: 12,
    marginBottom: 8,
  },
  postMeta: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    marginVertical: 20,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CommunityDetail;
