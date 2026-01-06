import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { audioRecorder } from '../services/audioRecorder';

export const VoiceRecorderModal = ({
  visible,
  onCancel,
  onSend,
  theme,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState('ready');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef(null);

  useEffect(() => {
    if (visible && !isRecording) {
      setDuration(0);
      setRecordingStatus('ready');
    }
  }, [visible]);

  // Пульсирующая анимация для иконки микрофона
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Обновляем длительность каждые 100ms
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        const status = audioRecorder.getStatus();
        setDuration(status.duration);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStartRecording = async () => {
    const success = await audioRecorder.startRecording();
    if (success) {
      setIsRecording(true);
      setRecordingStatus('recording');
      setDuration(0);
      recordingRef.current = true;
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    const result = await audioRecorder.stopRecording();
    if (result) {
      setRecordingStatus('ready_to_send');
      recordingRef.current = result;
    }
  };

  const handleCancel = async () => {
    setIsRecording(false);
    await audioRecorder.cancelRecording();
    setRecordingStatus('ready');
    setDuration(0);
    recordingRef.current = null;
    onCancel();
  };

  const handleSend = () => {
    if (recordingRef.current) {
      onSend(recordingRef.current);
      setRecordingStatus('ready');
      setDuration(0);
      recordingRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {/* Заголовок */}
          <Text style={[styles.title, { color: theme.text }]}>
            {isRecording ? '🎤 Запись голоса' : 'Отправить голосовое сообщение'}
          </Text>

          {/* Основной контент */}
          <View style={styles.content}>
            {isRecording ? (
              <>
                {/* Пульсирующий микрофон */}
                <Animated.View
                  style={[
                    styles.pulsingMic,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <View style={[styles.micContainer, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons name="mic" size={48} color={theme.primary} />
                  </View>
                </Animated.View>

                {/* Время записи */}
                <Text style={[styles.duration, { color: theme.text }]}>
                  {formatTime(duration)}
                </Text>

                {/* Статус */}
                <Text style={[styles.status, { color: theme.textSecondary }]}>
                  Говорите...
                </Text>
              </>
            ) : recordingRef.current ? (
              <>
                {/* Готово к отправке */}
                <View style={[styles.readyContainer, { backgroundColor: theme.primary + '15' }]}>
                  <Ionicons name="checkmark-circle" size={48} color={theme.success} />
                </View>

                <Text style={[styles.duration, { color: theme.text }]}>
                  {formatTime(recordingRef.current.duration)}
                </Text>

                <Text style={[styles.status, { color: theme.textSecondary }]}>
                  Голосовое сообщение готово
                </Text>
              </>
            ) : (
              <>
                {/* Начало */}
                <View style={[styles.readyContainer, { backgroundColor: theme.primary + '15' }]}>
                  <Ionicons name="mic-outline" size={48} color={theme.primary} />
                </View>

                <Text style={[styles.status, { color: theme.textSecondary }]}>
                  Нажмите кнопку для записи
                </Text>
              </>
            )}
          </View>

          {/* Кнопки управления */}
          <View style={styles.buttonsContainer}>
            {isRecording ? (
              <>
                {/* Во время записи: Стоп и Отмена */}
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { backgroundColor: theme.accent + '20' }]}
                  onPress={handleCancel}
                >
                  <Ionicons name="close" size={24} color={theme.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.stopButton, { backgroundColor: theme.accent }]}
                  onPress={handleStopRecording}
                >
                  <View style={styles.squareStop} />
                </TouchableOpacity>
              </>
            ) : recordingRef.current ? (
              <>
                {/* После записи: Отмена и Отправить */}
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { backgroundColor: theme.accent + '20' }]}
                  onPress={handleCancel}
                >
                  <Ionicons name="trash" size={24} color={theme.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.sendButton, { backgroundColor: theme.success }]}
                  onPress={handleSend}
                >
                  <Ionicons name="send" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Готовность к записи: Отмена и Начать */}
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { backgroundColor: theme.accent + '20' }]}
                  onPress={handleCancel}
                >
                  <Ionicons name="close" size={24} color={theme.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.startButton, { backgroundColor: theme.primary }]}
                  onPress={handleStartRecording}
                >
                  <Ionicons name="mic" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: 32,
  },
  pulsingMic: {
    marginBottom: 20,
  },
  micContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readyContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  duration: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  status: {
    fontSize: 14,
    fontWeight: '500',
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cancelButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  stopButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  squareStop: {
    width: 20,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  sendButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  startButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});

export default VoiceRecorderModal;
