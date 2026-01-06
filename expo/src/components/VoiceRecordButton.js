import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import audioRecorder from '../services/audioRecorder';

const VoiceRecordButton = ({ theme, onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingData, setRecordingData] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const recordingRef = useRef(null);

  // Пульсирующая анимация для иконки микрофона
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePressIn = async () => {
    console.log('🎤 Начало записи при зажатии');
    setIsRecording(true);
    setDuration(0);
    
    const success = await audioRecorder.startRecording();
    if (success) {
      recordingRef.current = true;
      
      // Анимация появления панели время
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    } else {
      setIsRecording(false);
    }
  };

  const handlePressOut = async () => {
    console.log('🛑 Конец записи при отпускании');
    setIsRecording(false);
    
    // Анимация скрытия панели времени
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    
    if (recordingRef.current) {
      const result = await audioRecorder.stopRecording();
      if (result) {
        console.log('✅ Голосовое сообщение записано', result);
        setRecordingData(result);
        recordingRef.current = null;
        
        // Автоматически отправляем
        setTimeout(() => {
          onSend(result);
          setRecordingData(null);
          setDuration(0);
        }, 300);
      } else {
        console.error('❌ Ошибка при остановке записи');
      }
    }
  };

  const handleCancel = async () => {
    console.log('❌ Отмена записи');
    setIsRecording(false);
    await audioRecorder.cancelRecording();
    recordingRef.current = null;
    setRecordingData(null);
    setDuration(0);
    
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const opacityAnim = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View>
      {/* Панель с временем записи (показывается при записи) */}
      <Animated.View
        style={[
          styles.recordingPanel,
          {
            backgroundColor: theme.accent + '20',
            borderTopColor: theme.accent,
            opacity: opacityAnim,
            maxHeight: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 60],
            }),
          },
        ]}
      >
        <View style={styles.recordingContent}>
          {/* Пульсирующая точка */}
          <Animated.View
            style={[
              styles.recordingDot,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />

          {/* Время */}
          <Text style={[styles.recordingTime, { color: theme.text }]}>
            {formatTime(duration)}
          </Text>

          {/* Текст */}
          <Text style={[styles.recordingText, { color: theme.textSecondary }]}>
            Отпустите для отправки
          </Text>

          {/* Кнопка отмены */}
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: theme.accent + '30' }]}
            onPress={handleCancel}
          >
            <Ionicons name="close" size={18} color={theme.accent} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Кнопка микрофона */}
      <Animated.View
        style={[
          styles.micButton,
          {
            transform: [{ scale: isRecording ? pulseAnim : 1 }],
          },
        ]}
      >
        <TouchableOpacity
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          delayLongPress={0}
          activeOpacity={0.8}
          style={[
            styles.button,
            {
              backgroundColor: isRecording ? theme.accent : theme.primary,
            },
          ]}
        >
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  recordingPanel: {
    borderTopWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recordingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    minWidth: 40,
  },
  recordingText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  micButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default VoiceRecordButton;
