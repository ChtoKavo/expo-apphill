import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const BannedAccountModal = ({ visible, onClose, reason, bannedAt, unbanAt }) => {
  const { theme } = useTheme();

  const formatTimeRemaining = () => {
    // Если бан навсегда (unbanAt = null или очень далеко в будущем)
    if (!unbanAt) return 'Навсегда';
    
    try {
      const now = new Date();
      const unbanDate = new Date(unbanAt);
      
      // Если дата разбана уже прошла, пользователь должен быть разбанен
      if (unbanDate <= now) {
        return 'Бан истек';
      }
      
      const diffInSeconds = Math.floor((unbanDate - now) / 1000);
      
      if (diffInSeconds < 60) return 'менее 1 минуты';
      if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} ${minutes === 1 ? 'минута' : 'минут'}`;
      }
      if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} ${hours === 1 ? 'час' : 'часов'}`;
      }
      
      const days = Math.floor(diffInSeconds / 86400);
      const hours = Math.floor((diffInSeconds % 86400) / 3600);
      return `${days} ${days === 1 ? 'день' : 'дней'} ${hours} ${hours === 1 ? 'час' : 'часов'}`;
    } catch (e) {
      return 'время неизвестно';
    }
  };

  const formatBanTime = () => {
    if (!bannedAt) return 'дата неизвестна';
    
    try {
      const date = new Date(bannedAt);
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      if (diffInSeconds < 60) return 'несколько секунд назад';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} минут назад`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} часов назад`;
      
      const diffInDays = Math.floor(diffInSeconds / 86400);
      return `${diffInDays} дн. назад`;
    } catch (e) {
      return 'дата неизвестна';
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: '#FFE5E5' }]}>
            <Ionicons name="ban" size={52} color="#FF3B30" />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>
            🚫 Аккаунт заблокирован
          </Text>

          {/* Ban Info Box */}
          <View style={[styles.infoBox, { backgroundColor: theme.background }]}>
            <View style={styles.infoRow}>
              <Ionicons name="document-text" size={18} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                Причина:
              </Text>
            </View>
            <Text style={[styles.reasonText, { color: theme.text }]}>
              {reason || 'Нарушение правил сообщества'}
            </Text>
          </View>

          {/* Ban Time Box */}
          <View style={[styles.timeBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.timeRow}>
              <Ionicons name="time" size={18} color="#FF9500" />
              <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>
                До разбана:
              </Text>
            </View>
            <Text style={[styles.timeValue, { color: '#FF9500' }]}>
              {formatTimeRemaining()}
            </Text>
            <Text style={[styles.banTimeNote, { color: theme.textSecondary }]}>
              Забанен {formatBanTime()}
            </Text>
          </View>

          {/* Message */}
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            Если вы считаете, что это ошибка, свяжитесь с поддержкой.
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>Понял</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  container: {
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  infoBox: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  reasonText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 28,
    lineHeight: 20,
  },
  timeBox: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 149, 0, 0.05)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 28,
    textTransform: 'capitalize',
  },
  banTimeNote: {
    fontSize: 12,
    marginLeft: 28,
    marginTop: 8,
    fontStyle: 'italic',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BannedAccountModal;
