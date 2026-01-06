import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, Dimensions, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

export const PinnedMessagesBar = ({ pinnedMessages, onPinnedMessagePress, onUnpin }) => {
  const { theme, isDark } = useTheme();
  const [showPinnedList, setShowPinnedList] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null;
  }

  const firstPinned = pinnedMessages[0];
  const isPinned = pinnedMessages.length > 0;

  const renderPinnedMessageContent = (message) => {
    if (message.media_type === 'image') {
      return '📷 Фото';
    } else if (message.media_type === 'video') {
      return '🎥 Видео';
    } else if (message.media_type === 'voice') {
      return '🎤 Голосовое сообщение';
    }
    return message.message || '[Без текста]';
  };

  const handlePressMessage = (message) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      onPinnedMessagePress(message);
      if (pinnedMessages.length > 1) {
        setShowPinnedList(false);
      }
    }, 150);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.pinnedBar,
          {
            backgroundColor: isDark ? theme.surface : theme.primary + '20',
            borderBottomColor: theme.primary + '40',
            borderLeftColor: theme.primary,
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        <TouchableOpacity
          style={styles.pinnedContent}
          onPress={() => {
            if (pinnedMessages.length > 1) {
              setShowPinnedList(true);
            } else {
              handlePressMessage(firstPinned);
            }
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.pinnedIconBox, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons
              name="bookmark"
              size={16}
              color={theme.primary}
              style={styles.pinnedIcon}
            />
          </View>
          <Text
            style={[styles.pinnedText, { color: theme.text }]}
            numberOfLines={1}
          >
            {renderPinnedMessageContent(firstPinned)}
          </Text>
        </TouchableOpacity>

        {pinnedMessages.length > 1 && (
          <View style={[styles.pinnedCount, { backgroundColor: theme.primary }]}>
            <Text style={styles.pinnedCountText}>{pinnedMessages.length}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => onUnpin(firstPinned.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </Animated.View>

      {/* Модаль со списком всех закреплённых сообщений */}
      <Modal
        visible={showPinnedList}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPinnedList(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)' }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.background }
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.modalTitleContainer}>
                <Ionicons name="bookmark" size={20} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Закреплённые сообщения ({pinnedMessages.length})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPinnedList(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={pinnedMessages}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pinnedMessageItem,
                    { backgroundColor: theme.surface, borderBottomColor: theme.border }
                  ]}
                  onPress={() => handlePressMessage(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.messageItemContent}>
                    <View style={[styles.messageItemIcon, { backgroundColor: theme.primary + '20' }]}>
                      <Ionicons
                        name="bookmark"
                        size={16}
                        color={theme.primary}
                      />
                    </View>
                    <View style={styles.messageItemText}>
                      <Text
                        style={[styles.messageSenderName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {item.sender_username || 'Неизвестный'}
                      </Text>
                      <Text
                        style={[styles.messageContent, { color: theme.textSecondary }]}
                        numberOfLines={2}
                      >
                        {renderPinnedMessageContent(item)}
                      </Text>
                      {item.created_at && (
                        <Text style={[styles.messageTime, { color: theme.textLight }]}>
                          {new Date(item.created_at).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      )}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.unpinButton}
                    onPress={() => {
                      onUnpin(item.id);
                      if (pinnedMessages.length === 1) {
                        setShowPinnedList(false);
                      }
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              scrollEnabled
              nestedScrollEnabled
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1.5,
    borderLeftWidth: 3,
    minHeight: 50,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
  },
  pinnedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  pinnedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  pinnedIcon: {
    marginRight: 0,
  },
  pinnedText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    letterSpacing: 0.1,
  },
  pinnedCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  pinnedCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  closeButton: {
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pinnedMessageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
  },
  messageItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageItemIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  messageItemText: {
    flex: 1,
  },
  messageSenderName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
    letterSpacing: 0.1,
  },
  messageContent: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 5,
  },
  messageTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  unpinButton: {
    padding: 8,
  },
});
