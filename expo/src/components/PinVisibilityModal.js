import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    },
    closeButton: {
      padding: 8,
    },
    optionsContainer: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 12,
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '10',
    },
    optionIcon: {
      marginRight: 12,
      width: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    buttonContainer: {
      flexDirection: 'row',
      marginTop: 20,
      gap: 10,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: theme.divider,
    },
    confirmButton: {
      backgroundColor: theme.primary,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600',
      color: 'white',
    },
    cancelButtonText: {
      color: theme.text,
    },
});

export const PinVisibilityModal = ({ visible, onClose, onSelect, theme }) => {
  const styles = getStyles(theme);
  const [selectedOption, setSelectedOption] = React.useState('all');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Видимость закрепа</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsContainer}>
            {/* Закреп для всех */}
            <TouchableOpacity
              style={[styles.option, selectedOption === 'all' && styles.optionActive]}
              onPress={() => setSelectedOption('all')}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name={selectedOption === 'all' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selectedOption === 'all' ? theme.primary : theme.textSecondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>📌 Видна для обоих</Text>
                <Text style={styles.optionDescription}>
                  Сообщение будет закреплено и видно собеседнику в панели закрепленных
                </Text>
              </View>
            </TouchableOpacity>

            {/* Закреп только у себя */}
            <TouchableOpacity
              style={[styles.option, selectedOption === 'me' && styles.optionActive]}
              onPress={() => setSelectedOption('me')}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name={selectedOption === 'me' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selectedOption === 'me' ? theme.primary : theme.textSecondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>🔒 Видна только мне</Text>
                <Text style={styles.optionDescription}>
                  Закреп будет виден только вам, собеседник его не увидит
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.optionsContainer, styles.buttonContainer]}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, styles.cancelButtonText]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => {
                onSelect(selectedOption === 'all');
                setSelectedOption('all');
                onClose();
              }}
            >
              <Text style={styles.buttonText}>Закрепить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
