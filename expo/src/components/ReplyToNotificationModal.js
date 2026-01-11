import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export const ReplyToNotificationModal = ({
  visible,
  onClose,
  replyData,
  replyMessage,
  setReplyMessage,
  onSendReply,
  onOpenChat,
  isSending
}) => {
  const { theme, isDark } = useTheme();

  if (!replyData) return null;

  const isGroupMessage = replyData.type === 'new_group_message';
  const senderName = replyData.sender_name || replyData.caller_name || 'Unknown';
  const groupName = replyData.group_name || '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          flex: 1,
          backgroundColor: isDark ? '#000' : '#fff'
        }}
      >
        {/* Фон */}
        <TouchableOpacity
          style={[styles.backdrop, {
            backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.3)'
          }]}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Модальное окно */}
        <View style={[styles.container, {
          backgroundColor: isDark ? '#1a1a1a' : '#fff'
        }]}>
          {/* Заголовок */}
          <View style={[styles.header, {
            borderBottomColor: isDark ? '#333' : '#eee'
          }]}>
            <Text style={[styles.headerTitle, {
              color: isDark ? '#fff' : '#000'
            }]}>
              📝 Ответить на сообщение
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSending}
              style={styles.closeButton}
            >
              <Ionicons
                name="close"
                size={24}
                color={isDark ? '#fff' : '#000'}
              />
            </TouchableOpacity>
          </View>

          {/* Информация об отправителе */}
          <View style={[styles.senderInfo, {
            backgroundColor: isDark ? '#222' : '#f5f5f5'
          }]}>
            <Ionicons
              name={isGroupMessage ? 'people' : 'person'}
              size={20}
              color={isDark ? '#0084ff' : '#0084ff'}
              style={styles.senderIcon}
            />
            <View style={styles.senderTextContainer}>
              {isGroupMessage && (
                <Text style={[styles.groupName, {
                  color: isDark ? '#aaa' : '#666'
                }]}>
                  💬 {groupName}
                </Text>
              )}
              <Text style={[styles.senderName, {
                color: isDark ? '#fff' : '#000'
              }]}>
                От: {senderName}
              </Text>
              {replyData.message && (
                <Text
                  style={[styles.messagePreview, {
                    color: isDark ? '#999' : '#666'
                  }]}
                  numberOfLines={2}
                >
                  {replyData.message}
                </Text>
              )}
            </View>
          </View>

          {/* Поле ввода */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, {
                backgroundColor: isDark ? '#222' : '#f0f0f0',
                color: isDark ? '#fff' : '#000',
                borderColor: isDark ? '#333' : '#ddd'
              }]}
              placeholder="Введите ответ..."
              placeholderTextColor={isDark ? '#666' : '#999'}
              value={replyMessage}
              onChangeText={setReplyMessage}
              multiline={true}
              editable={!isSending}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={[styles.charCounter, {
              color: isDark ? '#999' : '#666'
            }]}>
              {replyMessage.length}/500
            </Text>
          </View>

          {/* Кнопки действий */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.cancelButton, {
                backgroundColor: isDark ? '#333' : '#e0e0e0'
              }]}
              onPress={onClose}
              disabled={isSending}
            >
              <Ionicons name="close" size={18} color={isDark ? '#fff' : '#000'} />
              <Text style={[styles.cancelButtonText, {
                color: isDark ? '#fff' : '#000'
              }]}>
                Отмена
              </Text>
            </TouchableOpacity>

            {/* Кнопка открыть чат */}
            <TouchableOpacity
              style={[styles.openChatButton, {
                backgroundColor: isDark ? '#444' : '#007AFF'
              }]}
              onPress={() => {
                onClose();
                if (onOpenChat) onOpenChat(replyData);
              }}
              disabled={isSending}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={styles.openChatButtonText}>Открыть</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendButton, {
                backgroundColor: replyMessage.trim() && !isSending ? '#0084ff' : '#ccc',
                opacity: replyMessage.trim() && !isSending ? 1 : 0.6
              }]}
              onPress={onSendReply}
              disabled={!replyMessage.trim() || isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendButtonText}>Ответить</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    maxHeight: height * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginTop: 10,
    marginHorizontal: 15,
    borderRadius: 10,
  },
  senderIcon: {
    marginTop: 3,
    marginRight: 10,
  },
  senderTextContainer: {
    flex: 1,
  },
  groupName: {
    fontSize: 12,
    marginBottom: 3,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  messagePreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  inputContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    flex: 1,
    justifyContent: 'flex-start',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
    maxHeight: 150,
  },
  charCounter: {
    textAlign: 'right',
    marginTop: 5,
    fontSize: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  openChatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  openChatButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ReplyToNotificationModal;
