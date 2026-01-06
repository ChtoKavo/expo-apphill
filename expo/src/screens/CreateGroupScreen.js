import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { friendAPI, groupAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOrCreateSocket } from '../services/globalSocket';

const { width } = Dimensions.get('window');

const CreateGroupScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const response = await friendAPI.getFriends();
      const friendsList = Array.isArray(response.data) ? response.data : [];
      const normalizedFriends = friendsList
        .filter(friend => friend && typeof friend === 'object')
        .map(friend => ({
          id: friend.id,
          username: friend.username || friend.name || 'Пользователь',
          avatar: friend.avatar || null,
          status: friend.status || 'accepted',
          ...friend,
        }))
        .filter(friend => friend.status === 'accepted');
      setFriends(normalizedFriends);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить друзей');
    }
  };

  const toggleFriend = (friend) => {
    setSelectedFriends(prev => 
      prev.find(f => f.id === friend.id)
        ? prev.filter(f => f.id !== friend.id)
        : [...prev, friend]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Ошибка', 'Введите название группы');
      return;
    }
    if (selectedFriends.length === 0) {
      Alert.alert('Ошибка', 'Выберите участников');
      return;
    }

    setLoading(true);
    console.log('📝 Создание группы:', {
      name: groupName,
      description: groupDescription,
      membersCount: selectedFriends.length,
      members: selectedFriends.map(f => ({ id: f.id, username: f.username }))
    });
    
    try {
      const response = await groupAPI.createGroup({
        name: groupName,
        description: groupDescription,
        avatar: groupAvatar,
        members: selectedFriends.map(f => f.id)
      });
      console.log('✅ Группа создана успешно:', response);
      
      // 📡 Отправляем Socket событие участникам чтобы группа появилась в списке
      try {
        const socket = await getOrCreateSocket();
        if (socket && socket.connected) {
          socket.emit('group_created', {
            id: response.data?.id,
            name: groupName,
            description: groupDescription,
            avatar: groupAvatar,
            members: selectedFriends.map(f => f.id)
          });
          console.log('📤 Отправлено Socket событие group_created');
        }
      } catch (socketErr) {
        console.warn('⚠️  Не удалось отправить Socket событие:', socketErr);
      }
      
      Alert.alert('Успех', 'Группа создана', [
        { text: 'OK', onPress: () => {
          navigation.navigate('Main', { screen: 'Messages', params: { refresh: true } });
        }}
      ]);
    } catch (error) {
      console.error('❌ Ошибка создания группы:', error);
      console.error('   Сообщение:', error.message);
      console.error('   Полная ошибка:', error);
      Alert.alert('Ошибка', 'Не удалось создать группу: ' + (error.message || 'неизвестная ошибка'));
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
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setGroupAvatar(base64Image);
    }
  };

  const renderFriend = ({ item }) => {
    const isSelected = selectedFriends.find(f => f.id === item.id);
    return (
      <TouchableOpacity
        style={[
          styles.friendItem, 
          { 
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
          isSelected && { 
            borderColor: theme.primary,
            backgroundColor: theme.inputBackground,
          }
        ]}
        onPress={() => toggleFriend(item)}
        activeOpacity={0.6}
      >
        <View style={styles.friendAvatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
          ) : (
            <View style={[styles.friendAvatarPlaceholder, { backgroundColor: theme.primary }]}>
              <Text style={styles.friendAvatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
          )}
          {isSelected && (
            <View style={[styles.friendCheckmark, { backgroundColor: theme.success }]}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
        <Text style={[styles.friendName, { color: theme.text }]} numberOfLines={1}>
          {item.username}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#FF8C00', '#FF7B00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Новая группа</Text>
          <TouchableOpacity 
            onPress={createGroup}
            disabled={loading || !groupName.trim() || selectedFriends.length === 0}
            style={styles.headerButton}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity 
            onPress={pickImage}
            activeOpacity={0.7}
          >
            {groupAvatar ? (
              <View style={styles.avatarContainer}>
                <Image source={{ uri: groupAvatar }} style={styles.groupAvatarLarge} />
                <View style={[styles.cameraOverlay, { backgroundColor: theme.primary }]}>
                  <Ionicons name="camera" size={20} color="#fff" />
                </View>
              </View>
            ) : (
              <View style={[styles.groupAvatarPlaceholder, { 
                backgroundColor: theme.inputBackground,
                borderColor: theme.border
              }]}>
                <Ionicons name="camera" size={40} color={theme.textSecondary} />
                <Text style={[styles.avatarHint, { color: theme.textSecondary }]}>
                  Добавить фото
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          {/* Group Name */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Название группы</Text>
            <TextInput
              style={[styles.textInput, {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
                color: theme.text
              }]}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Введите название"
              placeholderTextColor={theme.textSecondary}
              maxLength={50}
            />
          </View>

          {/* Group Description */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Описание (необязательно)</Text>
            <TextInput
              style={[styles.textInput, styles.descriptionInput, {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
                color: theme.text
              }]}
              value={groupDescription}
              onChangeText={setGroupDescription}
              placeholder="Введите описание"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
          </View>

          {/* Members Header */}
          <View style={styles.membersHeader}>
            <View>
              <Text style={[styles.label, { color: theme.text }]}>
                Участники ({selectedFriends.length})
              </Text>
              <Text style={[styles.memberSubtitle, { color: theme.textSecondary }]}>
                Выбрано из {friends.length}
              </Text>
            </View>
          </View>

          {/* Friends List */}
          {friends.length > 0 ? (
            <FlatList
              data={friends}
              renderItem={renderFriend}
              keyExtractor={(item) => `friend-${item.id}`}
              numColumns={3}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              columnWrapperStyle={styles.friendsRow}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons 
                name="people-outline" 
                size={40} 
                color={theme.textLight}
              />
              <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                Нет друзей для добавления
              </Text>
            </View>
          )}
        </View>

        {/* Create Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={createGroup}
            disabled={loading || !groupName.trim() || selectedFriends.length === 0}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={
                (loading || !groupName.trim() || selectedFriends.length === 0)
                  ? ['#cccccc', '#999999']
                  : ['#FFA705', '#FF8C00']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButton}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.createButtonText}>Создать группу</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    paddingBottom: 30,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  groupAvatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#667eea',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  groupAvatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  avatarHint: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
    color: '#667eea',
  },
  formSection: {
    paddingHorizontal: 16,
  },
  formGroup: {
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    color: '#1a202c',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
    borderColor: '#e2e8f0',
    backgroundColor: '#f7f8fc',
    color: '#1a202c',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  memberSubtitle: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  friendsRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  friendItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    maxWidth: '31%',
    backgroundColor: '#f7f8fc',
    borderColor: '#e2e8f0',
  },
  friendAvatarContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  friendAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  friendAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  friendCheckmark: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  friendName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    color: '#1a202c',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 15,
    marginTop: 14,
    fontWeight: '500',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  createButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default CreateGroupScreen;