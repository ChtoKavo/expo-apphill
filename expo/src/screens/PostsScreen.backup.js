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

  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const response = await postAPI.getPosts();
      setPosts(response.data);
    } catch (error) {
      console.error('Ошибка загрузки постов:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить посты');
    }
  };

  const createPost = async () => {
    if (!newPostText.trim()) {
      Alert.alert('Ошибка', 'Введите текст поста');
      return;
    }

    setLoading(true);
    try {
      await postAPI.createPost({
        content: newPostText,
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение для доступа к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.3,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setNewPostImage(base64Image);
    }
  };

  const toggleLike = async (postId) => {
    try {
      await postAPI.likePost(postId);
      loadPosts();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось поставить лайк');
    }
  };

  const PostCard = React.memo(({ item }) => (
    <Animated.View style={[styles.postContainer, { backgroundColor: theme.surface }]}>
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

  const renderHeader = () => (
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
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {renderHeader()}
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
              >
                <Ionicons name="image" size={24} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  Добавить фото
                </Text>
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
              >
                <Ionicons name="image" size={24} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  Добавить фото
                </Text>
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

          <TextInput
            style={[styles.postInput, { color: theme.text }]}
            value={newPostText}
            onChangeText={setNewPostText}
            placeholder="Что у вас нового?"
            placeholderTextColor={theme.textLight}
            multiline
            numberOfLines={5}
          />

          {newPostImage ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: newPostImage }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setNewPostImage('')}
              >
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.addImageButton, { backgroundColor: theme.surface }]} onPress={pickImage}>
              <Text style={[styles.addImageText, { color: theme.textSecondary }]}>📷 Добавить фото</Text>
            </TouchableOpacity>
          )}
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  postsList: {
    paddingTop: 10,
  },
  postContainer: {
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 16,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
    backgroundColor: '#667eea',
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
    flex: 1,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postContent: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  postImage: {
    width: '100%',
    height: width * 0.5625, // 16:9 aspect ratio
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
    paddingVertical: 4,
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
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
    paddingTop: 8,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
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
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PostsScreen;