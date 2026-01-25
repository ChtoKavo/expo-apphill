import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export const MediaCaptionModal = ({ 
  visible, 
  onClose, 
  onSend, 
  mediaUri, 
  mediaType = 'image',
  theme 
}) => {
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setCaption('');
    }
  }, [visible]);

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onSend(caption);
      setCaption('');
      onClose();
    } catch (error) {
      console.error('Ошибка отправки:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setCaption('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme?.background }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Заголовок */}
          <View style={[styles.header, { backgroundColor: theme?.surface, borderBottomColor: theme?.border }]}>
            <TouchableOpacity 
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={theme?.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme?.text }]}>Добавить подпись</Text>
            <TouchableOpacity 
              onPress={handleSend}
              disabled={isSending}
              style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
            >
              <Text style={[styles.sendButtonText, isSending && styles.sendButtonTextDisabled]}>
                {isSending ? 'Отправка...' : 'Отправить'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Превью медиа */}
          {mediaUri && (
            <View style={styles.previewContainer}>
              {mediaType === 'image' ? (
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.preview}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.preview, styles.videoPreview]}>
                  <Ionicons name="play-circle" size={64} color={theme?.primary} />
                  <Text style={[styles.videoLabel, { color: theme?.text }]}>Видео</Text>
                </View>
              )}
            </View>
          )}

          {/* Поле ввода подписи */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: theme?.text }]}>Подпись (опционально):</Text>
            <TextInput
              style={[
                styles.captionInput,
                {
                  backgroundColor: theme?.surface,
                  color: theme?.text,
                  borderColor: theme?.border,
                }
              ]}
              placeholder="Добавьте подпись к медиа..."
              placeholderTextColor={theme?.textSecondary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: theme?.textSecondary }]}>
              {caption.length}/500
            </Text>
          </View>

          {/* Подсказка */}
          <View style={styles.tipsSection}>
            <Text style={[styles.tipsTitle, { color: theme?.text }]}>💡 Совет:</Text>
            <Text style={[styles.tipsText, { color: theme?.textSecondary }]}>
              Подпись появится под изображением или видео в чате
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#60A5FA',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  sendButtonTextDisabled: {
    opacity: 0.7,
  },
  previewContainer: {
    height: height * 0.3,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  videoPreview: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  videoLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  inputSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  captionInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    maxHeight: 150,
    minHeight: 100,
  },
  charCount: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  tipsSection: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f4ff',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  tipsText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
