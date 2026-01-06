import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import communitiesAPI from '../services/communitiesAPI';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';

// Вспомогательная функция для безопасной обработки URI
const getImageUri = (uri) => {
  if (!uri) return null;
  if (typeof uri === 'string') return uri;
  if (typeof uri === 'object' && uri.uri && typeof uri.uri === 'string') return uri.uri;
  return null;
};

const { width } = Dimensions.get('window');

const CommunitiesScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { error, warning, success } = useModalAlert();

  const [communities, setCommunities] = useState([]);
  const [filteredCommunities, setFilteredCommunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'my', 'popular'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDescription, setNewCommunityDescription] = useState('');
  const [newCommunityImage, setNewCommunityImage] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCommunities();
  }, []);

  useEffect(() => {
    filterCommunities();
  }, [communities, searchQuery, activeTab]);

  const loadCommunities = async () => {
    setLoading(true);
    try {
      const response = await communitiesAPI.getCommunities?.();
      
      let data = [];
      
      // ✅ Правильно парсим ответ API (fetch формат: { data, status })
      if (response?.data) {
        if (Array.isArray(response.data)) {
          data = response.data;
        } else if (response.data?.data && Array.isArray(response.data.data)) {
          data = response.data.data;
        } else if (response.data?.communities && Array.isArray(response.data.communities)) {
          data = response.data.communities;
        }
      }
      
      setCommunities(data);
    } catch (err) {
      console.error('❌ Ошибка загрузки сообществ:', err.message);
      error('Ошибка', 'Не удалось загрузить сообщества');
      setCommunities([]);
    } finally {
      setLoading(false);
    }
  };

  const filterCommunities = () => {
    let filtered = Array.isArray(communities) ? [...communities] : [];

    // Фильтр по табу
    if (activeTab === 'popular') {
      filtered = filtered.sort((a, b) => (b.members_count || 0) - (a.members_count || 0)).slice(0, 20);
    } else if (activeTab === 'my') {
      filtered = filtered.filter(c => c.is_member);
    }

    // Фильтр по поиску
    if (searchQuery.trim()) {
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredCommunities(filtered);
  };

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim()) {
      warning('Ошибка', 'Введите название сообщества');
      return;
    }

    setIsCreating(true);
    try {
      console.log('═══════════════════════════════════════');
      console.log('🚀 НАЧАЛО: Создание сообщества');
      console.log('═══════════════════════════════════════');
      console.log('📝 Название:', newCommunityName);
      console.log('📄 Описание:', newCommunityDescription);
      console.log('🖼️ Изображение:', !!newCommunityImage);
      
      // ✅ СОЗДАЁМ FormData
      const formData = new FormData();
      
      console.log('📦 Создаём FormData...');
      formData.append('name', newCommunityName);
      formData.append('description', newCommunityDescription);
      
      // Если есть изображение
      if (newCommunityImage) {
        console.log('📸 Добавляем изображение в FormData...');
        
        // newCommunityImage теперь содержит { blob, uri, type, name }
        if (newCommunityImage.blob instanceof Blob) {
          console.log('✅ Это Blob объект, размер:', (newCommunityImage.blob.size / 1024).toFixed(2), 'KB');
          
          // Добавляем Blob напрямую в FormData
          formData.append('image', newCommunityImage.blob, newCommunityImage.name);
          console.log('✅ Blob добавлен в FormData');
        } else {
          console.warn('⚠️ Image не является Blob');
        }
      }

      console.log('═══════════════════════════════════════');
      console.log('📤 ОТПРАВКА ЗАПРОСА');
      console.log('═══════════════════════════════════════');
      
      // ОТПРАВЛЯЕМ FormData
      const response = await communitiesAPI.createCommunity(formData);

      console.log('═══════════════════════════════════════');
      console.log('✅ ОТВЕТ ПОЛУЧЕН');
      console.log('═══════════════════════════════════════');
      
      if (response?.data) {
        const newCommunity = response.data;
        console.log('🎉 Новое сообщество:', newCommunity);
        
        if (newCommunity.id) {
          setCommunities([newCommunity, ...communities]);
          success('Успех', 'Сообщество создано!');
        }
      }

      // Очищаем форму
      setNewCommunityName('');
      setNewCommunityDescription('');
      setNewCommunityImage(null);
      setShowCreateModal(false);

      // Перезагружаем список через 1 сек
      setTimeout(() => {
        loadCommunities();
      }, 1000);
      
    } catch (err) {
      console.error('═══════════════════════════════════════');
      console.error('❌ ОШИБКА СОЗДАНИЯ СООБЩЕСТВА');
      console.error('═══════════════════════════════════════');
      console.error('Message:', err.message);
      console.error('Code:', err.code);
      console.error('Status:', err.response?.status);
      console.error('Response:', err.response?.data);
      console.error('═══════════════════════════════════════');
      
      error('Ошибка', err.response?.data?.error || err.message || 'Не удалось создать сообщество');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinCommunity = async (communityId) => {
    try {
      await communitiesAPI.joinCommunity?.(communityId);
      // Локально обновляем статус
      setCommunities(communities.map(c =>
        c.id === communityId
          ? { ...c, is_member: true, members_count: (c.members_count || 0) + 1 }
          : c
      ));
      success('Успех', 'Вы присоединились к сообществу!');
    } catch (err) {
      console.error('❌ Ошибка присоединения:', err);
      error('Ошибка', 'Не удалось присоединиться');
    }
  };

  const handleLeaveCommunity = async (communityId) => {
    try {
      await communitiesAPI.leaveCommunity?.(communityId);
      // Локально обновляем статус
      setCommunities(communities.map(c =>
        c.id === communityId
          ? { ...c, is_member: false, members_count: Math.max(0, (c.members_count || 1) - 1) }
          : c
      ));
      success('Успех', 'Вы покинули сообщество');
    } catch (err) {
      console.error('❌ Ошибка выхода:', err);
      error('Ошибка', 'Не удалось покинуть сообщество');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled) {
      // Конвертируем base64 в Blob
      const base64 = result.assets[0].base64;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      
      console.log(`📸 Изображение выбрано, размер Blob: ${(blob.size / 1024).toFixed(2)} KB`);
      
      // Сохраняем как объект с uri, тип и blob
      setNewCommunityImage({
        blob,
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: `community-${Date.now()}.jpg`,
      });
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCommunities();
    setRefreshing(false);
  }, []);

  const renderCommunityCard = ({ item }) => {
    if (!item) return null;
    
    const imageUri = getImageUri(item.image);
    
    // Логирование ТОЛЬКО для отладки изображений
    if (imageUri) {
      console.log(`✅ ${item.name}: image=${imageUri.substring(0, 60)}...`);
    } else {
      console.log(`⚠️ ${item.name}: NO IMAGE (image field: ${JSON.stringify(item.image)})`);
    }
    
    return (
    <TouchableOpacity
      style={[styles.communityCard, { backgroundColor: theme.surface }]}
      activeOpacity={0.7}
      onPress={() => navigation?.navigate('CommunityDetail', { communityId: item.id })}
    >
      {/* Аватар сообщества */}
      <View style={styles.communityAvatarWrapper}>
        {imageUri ? (
          <Image 
            source={{ uri: imageUri }} 
            style={styles.communityAvatar}
            onLoad={() => console.log(`📸 Loaded: ${item.name}`)}
            onError={(err) => console.error(`❌ Error loading ${item.name}: ${err.error}`)}
          />
        ) : (
          <View style={[styles.communityAvatar, { backgroundColor: theme.primary }]}>
            <Ionicons name="people" size={32} color="#fff" />
          </View>
        )}
      </View>

      {/* Информация */}
      <View style={styles.communityInfo}>
        <Text style={[styles.communityName, { color: theme.text }]} numberOfLines={1}>
          {item.name || 'Без названия'}
        </Text>
        <Text style={[styles.communityDescription, { color: theme.textSecondary }]} numberOfLines={2}>
          {item.description || 'Нет описания'}
        </Text>
        <View style={styles.communityStats}>
          <View style={styles.statBadge}>
            <Ionicons name="people" size={14} color={theme.primary} />
            <Text style={[styles.statText, { color: theme.text }]}>
              {item.members_count || 0}
            </Text>
          </View>
          <View style={styles.statBadge}>
            <Ionicons name="chatbubbles" size={14} color={theme.primary} />
            <Text style={[styles.statText, { color: theme.text }]}>
              {item.posts_count || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Кнопка действия */}
      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            backgroundColor: item.is_member ? 'rgba(255,59,48,0.1)' : theme.primary,
          },
        ]}
        onPress={(e) => {
          e.stopPropagation();
          if (item.is_member) {
            handleLeaveCommunity(item.id);
          } else {
            handleJoinCommunity(item.id);
          }
        }}
      >
        <Ionicons
          name={item.is_member ? 'checkmark' : 'add'}
          size={20}
          color={item.is_member ? '#FF3B30' : '#fff'}
        />
      </TouchableOpacity>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Сообщества</Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Поиск сообществ..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {['all', 'my', 'popular'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && [styles.activeTab, { backgroundColor: theme.primary }]]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? '#fff' : theme.textSecondary },
                ]}
              >
                {tab === 'all' ? 'Все' : tab === 'my' ? 'Мои' : 'Популярные'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredCommunities}
          renderItem={renderCommunityCard}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery ? 'Сообщества не найдены' : 'Нет сообществ'}
              </Text>
            </View>
          }
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новое сообщество</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.modalContent}>
            {/* Image */}
            <TouchableOpacity
              style={[styles.imagePickerButton, { backgroundColor: theme.surface }]}
              onPress={pickImage}
            >
              {newCommunityImage ? (
                <Image source={{ uri: getImageUri(newCommunityImage) }} style={styles.pickedImage} />
              ) : (
                <>
                  <Ionicons name="image" size={48} color={theme.primary} />
                  <Text style={[styles.imagePickerText, { color: theme.textSecondary }]}>
                    Выберите обложку
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Название</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
                placeholder="Название сообщества"
                placeholderTextColor={theme.textSecondary}
                value={newCommunityName}
                onChangeText={setNewCommunityName}
                maxLength={50}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Описание</Text>
              <TextInput
                style={[styles.input, styles.descriptionInput, { backgroundColor: theme.surface, color: theme.text }]}
                placeholder="Описание сообщества"
                placeholderTextColor={theme.textSecondary}
                value={newCommunityDescription}
                onChangeText={setNewCommunityDescription}
                maxLength={200}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createSubmitButton, { backgroundColor: theme.primary, opacity: isCreating ? 0.6 : 1 }]}
              onPress={handleCreateCommunity}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createSubmitButtonText}>Создать сообщество</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  activeTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  communityAvatarWrapper: {
    position: 'relative',
  },
  communityAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#667eea',
  },
  communityInfo: {
    flex: 1,
  },
  communityName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  communityDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  communityStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  imagePickerButton: {
    height: 160,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#667eea',
  },
  pickedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imagePickerText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  createSubmitButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  createSubmitButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
});

export default CommunitiesScreen;
