import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const ModalAlert = ({
  visible,
  type = 'info', // 'success', 'error', 'warning', 'info'
  title,
  message,
  onClose,
  buttons = [],
  autoClose = true,
  autoCloseDuration = 2000,
}) => {
  const { theme } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  // Минималистичные иконки
  const typeConfig = {
    success: {
      icon: 'checkmark-circle',
      color: '#34C759',
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
    },
    error: {
      icon: 'close-circle',
      color: '#FF3B30',
      backgroundColor: 'rgba(255, 59, 48, 0.12)',
    },
    warning: {
      icon: 'warning',
      color: '#FF9500',
      backgroundColor: 'rgba(255, 149, 0, 0.12)',
    },
    info: {
      icon: 'information-circle',
      color: '#60A5FA',
      backgroundColor: 'rgba(102, 126, 234, 0.12)',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 6,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoClose && !buttons.length) {
        const timer = setTimeout(() => {
          onClose?.();
        }, autoCloseDuration);
        return () => clearTimeout(timer);
      }
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleButtonPress = (button) => {
    if (button.onPress) {
      button.onPress();
    }
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Основное модальное окно - минималистичное */}
          <View
            style={[
              styles.modal,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border || 'rgba(0,0,0,0.1)',
              },
            ]}
          >
            {/* Иконка - простая, без фона */}
            <View style={[
              styles.iconContainer,
              { backgroundColor: config.backgroundColor }
            ]}>
              <Ionicons
                name={config.icon}
                size={48}
                color={config.color}
              />
            </View>

            {/* Заголовок */}
            {title && (
              <Text
                style={[
                  styles.title,
                  { color: theme.text },
                ]}
              >
                {title}
              </Text>
            )}

            {/* Сообщение */}
            {message && (
              <Text
                style={[
                  styles.message,
                  { color: theme.textSecondary || '#888' },
                ]}
              >
                {message}
              </Text>
            )}

            {/* Кнопки */}
            {buttons.length > 0 ? (
              <View
                style={[
                  styles.buttonsContainer,
                  buttons.length === 1 && styles.singleButton,
                  buttons.length === 2 && styles.twoButtons,
                ]}
              >
                {buttons.map((button, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      {
                        backgroundColor: button.color || (button.style === 'cancel' ? 'rgba(0,0,0,0.05)' : button.style === 'destructive' ? '#FF3B30' : theme.primary),
                        flex: buttons.length > 1 ? 1 : 0,
                        marginRight: index < buttons.length - 1 ? 8 : 0,
                      },
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { 
                          color: button.textColor || (button.style === 'cancel' ? theme.text : button.style === 'destructive' ? '#fff' : '#fff') 
                        },
                      ]}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: theme.primary },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.buttonText, { color: '#fff' }]}>
                  Закрыть
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: Dimensions.get('window').width - 40,
    maxWidth: 380,
  },
  modal: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  singleButton: {
    justifyContent: 'center',
  },
  twoButtons: {
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ModalAlert;
