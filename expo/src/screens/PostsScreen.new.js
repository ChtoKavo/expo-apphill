import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  TextInput,
  Modal,
  Animated,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { postAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

const PostsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);

  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    // Проверяем разрешения при открытии экрана
    const checkPermissions = async () => {
      try {
        const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
        console.log('📋 Статус разрешений галереи:', permission);
        
        if (!permission.granted && permission.canAskAgain) {
          console.log('⚠️ Разрешение не дано, но можно запросить');
        }
      } catch (error) {
        console.error('❌ Ошибка проверки разрешений:', error);
      }
    };
    
    checkPermissions();
  }, []);

  const loadPosts = async () => {
    try {
      setRefreshing(true);
      const response = await postAPI.getPosts();
      setPosts(response.data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить посты');
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadPosts();
  }, []);

  const createPost = async () => {
    if (!newPostText.trim() && !newPostImage) {
      Alert.alert('Ошибка', 'Добавьте текст или изображение');
      return;
    }

    setLoading(true);
    try {
      await postAPI.createPost({
        content: newPostText.trim(),
        image: newPostImage || null,
      });
      setNewPostText('');
      setNewPostImage('');
      setShowCreateModal(false);
      loadPosts();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать пост');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      setImageLoading(true);
      console.log('📸 Начинаю выбор изображения...');
      
      // Шаг 1: Запрашиваем разрешение
      console.log('🔐 Проверяю разрешения галереи...');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('📋 Результат запроса разрешения:', permission);
      
      if (!permission.granted) {
        console.warn('❌ Разрешение не дано. Status:', permission.status);
        Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
        return;
      }
      
      console.log('✅ Разрешение получено');
      
      // Шаг 2: Открываем галерею
      console.log('📱 Открываю галерею...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: true,
      });
      
      console.log('📦 Результат выбора:', { 
        canceled: result.canceled, 
        hasAssets: result.assets && result.assets.length > 0,
        assetsLength: result.assets?.length
      });
      
      // Проверяем что пользователь не отменил
      if (result.canceled) {
        console.log('⏭️ Пользователь отменил выбор');
        return;
      }
      
      // Проверяем что есть выбранные файлы
      if (!result.assets || result.assets.length === 0) {
        console.error('❌ Нет выбранных файлов');
        Alert.alert('Ошибка', 'Не удалось получить изображение');
        return;
      }
      
      const selectedAsset = result.assets[0];
      console.log('🖼️ Выбранное изображение:', {
        uri: selectedAsset.uri,
        width: selectedAsset.width,
        height: selectedAsset.height,
        hasBase64: !!selectedAsset.base64
      });
      
      // Шаг 3: Обработка изображения
      let imageToSave = null;
      
      // Сначала пытаемся использовать base64 если он есть
      if (selectedAsset.base64) {
        imageToSave = `data:image/jpeg;base64,${selectedAsset.base64}`;
        console.log('✅ Используем base64 изображение');
      } else {
        // Fallback: используем URI если base64 недоступен
        imageToSave = selectedAsset.uri;
        console.log('⚠️ Base64 недоступен, используем URI:', imageToSave);
      }
      
      // Шаг 4: Сохраняем в state
      if (imageToSave) {
        setNewPostImage(imageToSave);
        console.log('✅ Изображение сохранено в state');
      } else {
        throw new Error('Не удалось обработать изображение');
      }
      
    } catch (error) {
      console.error('❌ Ошибка при выборе изображения:', error);
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
      Alert.alert('Ошибка', `Не удалось выбрать изображение: ${error.message}`);
    } finally {
      setImageLoading(false);
    }
  };

  const toggleLike = async (postId) => {
    try {
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            is_liked: !post.is_liked,
            likes_count: post.is_liked ? post.likes_count - 1 : post.likes_count + 1
          };
        }
        return post;
      });
      setPosts(updatedPosts);
      await postAPI.likePost(postId);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось поставить лайк');
      loadPosts(); // Перезагружаем посты в случае ошибки
    }
  };

  const sharePost = async (post) => {
    try {
      await Share.share({
        message: post.content,
        url: post.image,
        title: 'Поделиться постом'
      });
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось поделиться постом');
    }
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const postDate = new Date(date);
    const diff = now - postDate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} д.`;
    if (hours > 0) return `${hours} ч.`;
    if (minutes > 0) return `${minutes} мин.`;
    return 'сейчас';
  };

  const PostCard = React.memo(({ item }) => (
    <Animated.View style={[
      styles.postContainer,
      { backgroundColor: theme.surface }
    ]}>
      <TouchableOpacity
        style={styles.postHeader}
        onPress={() => setSelectedPost(item)}
      >
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.username, { color: theme.text }]}>{item.username}</Text>
            <Text style={[styles.postTime, { color: theme.textSecondary }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => Alert.alert('Действия', 'Выберите действие', [
            { text: 'Поделиться', onPress: () => sharePost(item) },
            { text: 'Пожаловаться', style: 'destructive' },
            { text: 'Отмена', style: 'cancel' },
          ])}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>

      {item.content && (
        <Text style={[styles.postContent, { color: theme.text }]}>
          {item.content}
        </Text>
      )}

      {item.image && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedPost(item)}
        >
          <Image
            source={{ uri: item.image }}
            style={styles.postImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}

      <View style={styles.postActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => toggleLike(item.id)}
        >
          <Ionicons
            name={item.is_liked ? 'heart' : 'heart-outline'}
            size={24}
            color={item.is_liked ? '#FF3B30' : theme.textSecondary}
          />
          <Text style={[
            styles.actionText,
            { color: item.is_liked ? '#FF3B30' : theme.textSecondary }
          ]}>
            {item.likes_count}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Comments', { postId: item.id })}
        >
          <Ionicons name="chatbubble-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>
            {item.comments_count}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => sharePost(item)}
        >
          <Ionicons name="share-outline" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  ));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View style={[
        styles.header,
        {
          backgroundColor: theme.surface,
          opacity: headerOpacity,
          borderBottomColor: theme.border,
        }
      ]}>
        <Text style={[styles.title, { color: theme.text }]}>Лента</Text>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: theme.primary }]}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <FlatList
        data={posts}
        renderItem={({ item }) => <PostCard item={item} />}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.postsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      />

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              onPress={() => {
                if (newPostText.trim() || newPostImage) {
                  Alert.alert(
                    'Отменить создание',
                    'Вы уверены? Введенный текст будет утерян.',
                    [
                      { text: 'Продолжить', style: 'cancel' },
                      { text: 'Отменить создание', style: 'destructive', onPress: () => {
                        setShowCreateModal(false);
                        setNewPostText('');
                        setNewPostImage('');
                      }},
                    ]
                  );
                } else {
                  setShowCreateModal(false);
                }
              }}
            >
              <Text style={[styles.modalButton, { color: theme.danger }]}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новый пост</Text>
            <TouchableOpacity
              onPress={createPost}
              disabled={loading || (!newPostText.trim() && !newPostImage)}
            >
              <Text style={[
                styles.modalButton,
                { color: theme.primary },
                (loading || (!newPostText.trim() && !newPostImage)) && { opacity: 0.5 }
              ]}>
                {loading ? 'Публикация...' : 'Опубликовать'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.createContent}>
            <TextInput
              style={[styles.postInput, { color: theme.text }]}
              value={newPostText}
              onChangeText={setNewPostText}
              placeholder="Что у вас нового?"
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
              autoFocus
            />

            {newPostImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: newPostImage }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setNewPostImage('')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={[styles.removeImageContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.addImageButton, { backgroundColor: theme.surface }]}
                onPress={pickImage}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={imageLoading}
              >
                {imageLoading ? (
                  <>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.addImageText, { color: theme.primary }]}>
                      Загрузка...
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="image" size={24} color={theme.primary} />
                    <Text style={[styles.addImageText, { color: theme.primary }]}>
                      Добавить фото
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!selectedPost}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPost(null)}
      >
        <View style={styles.imageModalOverlay}>
          <View style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.9)' }]} />
          </View>
          {selectedPost?.image && (
            <Image
              source={{ uri: selectedPost.image }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.closeModalButton}
            onPress={() => setSelectedPost(null)}
          >
            <View style={[styles.closeModalContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  postsList: {
    paddingTop: 10,
  },
  postContainer: {
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userInfo: {
    marginLeft: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  postTime: {
    fontSize: 13,
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  postImage: {
    width: '100%',
    height: width * 0.5625,
    backgroundColor: '#f0f0f0',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  createContent: {
    flex: 1,
    padding: 15,
  },
  postInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
  },
  addImageText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  imagePreview: {
    marginTop: 15,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: width * 0.5625,
    backgroundColor: '#f0f0f0',
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  removeImageContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: width,
    height: width,
  },
  closeModalButton: {
    position: 'absolute',
    top: 40,
    right: 20,
  },
  closeModalContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});

export default PostsScreen;