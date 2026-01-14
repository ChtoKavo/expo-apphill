import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');
const CIRCLE_SIZE = Math.min(width * 0.7, 280);
const MAX_DURATION = 60; // Максимальная длительность видеокружка - 60 секунд

const VideoCircleRecorder = ({ 
  visible, 
  onClose, 
  onVideoRecorded, 
  theme 
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(null);
  const [cameraType, setCameraType] = useState('front');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  
  const cameraRef = useRef(null);
  const recordingTimer = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Запрос разрешений при монтировании
  useEffect(() => {
    (async () => {
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      setAudioPermission(audioStatus === 'granted');
      
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, []);

  // Анимация появления
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      stopRecording();
    }
  }, [visible]);

  // Пульсирующая анимация при записи
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Анимация прогресса
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_DURATION * 1000,
        useNativeDriver: false,
      }).start();
    } else {
      pulseAnim.setValue(1);
      progressAnim.setValue(0);
    }
  }, [isRecording]);

  // Таймер записи
  useEffect(() => {
    if (isRecording) {
      recordingTimer.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= MAX_DURATION) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      setRecordingDuration(0);
    }

    return () => {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady || isRecording) return;

    try {
      setIsRecording(true);
      
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION,
        quality: '480p', // Понижено для быстрой загрузки
        mute: false,
      });

      if (video && video.uri) {
        onVideoRecorded({
          uri: video.uri,
          duration: recordingDuration,
          type: 'video_circle',
        });
        onClose();
      }
    } catch (error) {
      console.error('Ошибка записи видео:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      setIsRecording(false);
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Ошибка остановки записи:', error);
    }
  };

  const flipCamera = () => {
    setCameraType((current) =>
      current === 'back' ? 'front' : 'back'
    );
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  const hasAllPermissions = permission?.granted && audioPermission;

  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
          <Text style={styles.loadingText}>Загрузка камеры...</Text>
        </View>
      </Modal>
    );
  }

  if (!hasAllPermissions) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
          <Text style={styles.errorText}>Нет доступа к камере или микрофону</Text>
          <TouchableOpacity 
            style={styles.permissionBtn} 
            onPress={async () => {
              await requestPermission();
              const { status } = await Audio.requestPermissionsAsync();
              setAudioPermission(status === 'granted');
            }}
          >
            <Text style={styles.permissionBtnText}>Запросить разрешения</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const progressInterpolate = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
        {/* Кнопка закрытия */}
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onClose}
          disabled={isRecording}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Заголовок */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isRecording ? 'Запись видеокружка' : 'Видеокружок'}
          </Text>
          {isRecording && (
            <View style={styles.durationBadge}>
              <View style={styles.recordingDot} />
              <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
            </View>
          )}
        </View>

        {/* Контейнер камеры */}
        <Animated.View
          style={[
            styles.cameraContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Круглая рамка прогресса */}
          <Animated.View
            style={[
              styles.progressRing,
              isRecording && styles.progressRingRecording,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            {isRecording && (
              <Animated.View
                style={[
                  styles.progressIndicator,
                  {
                    transform: [{ rotate: progressInterpolate }],
                  },
                ]}
              >
                <View style={styles.progressDot} />
              </Animated.View>
            )}
          </Animated.View>

          {/* Камера */}
          <View style={styles.cameraWrapper}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={cameraType}
              mode="video"
              onCameraReady={() => setCameraReady(true)}
            />
          </View>
        </Animated.View>

        {/* Инструкция */}
        <Text style={styles.instruction}>
          {isRecording 
            ? 'Отпустите для отправки' 
            : 'Зажмите и удерживайте для записи'}
        </Text>

        {/* Кнопки управления */}
        <View style={styles.controls}>
          {/* Кнопка смены камеры */}
          <TouchableOpacity
            style={[styles.controlButton, isRecording && styles.controlButtonDisabled]}
            onPress={flipCamera}
            disabled={isRecording}
          >
            <Ionicons 
              name="camera-reverse" 
              size={24} 
              color={isRecording ? '#666' : '#fff'} 
            />
          </TouchableOpacity>

          {/* Кнопка записи */}
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonRecording,
            ]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.8}
          >
            <View style={[
              styles.recordButtonInner,
              isRecording && styles.recordButtonInnerRecording,
            ]} />
          </TouchableOpacity>

          {/* Пустой placeholder для симметрии */}
          <View style={styles.controlButton} />
        </View>

        {/* Подсказка */}
        <Text style={styles.hint}>
          Макс. длительность: {MAX_DURATION} сек
        </Text>
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
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  header: {
    position: 'absolute',
    top: 100,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  durationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraContainer: {
    width: CIRCLE_SIZE + 20,
    height: CIRCLE_SIZE + 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRing: {
    position: 'absolute',
    width: CIRCLE_SIZE + 16,
    height: CIRCLE_SIZE + 16,
    borderRadius: (CIRCLE_SIZE + 16) / 2,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  progressRingRecording: {
    borderColor: '#EF4444',
  },
  progressIndicator: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginTop: -6,
  },
  cameraWrapper: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  camera: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  instruction: {
    marginTop: 30,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    gap: 40,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  recordButtonRecording: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderColor: '#EF4444',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  recordButtonInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  hint: {
    position: 'absolute',
    bottom: 50,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#667eea',
    borderRadius: 12,
    marginBottom: 12,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VideoCircleRecorder;
