import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { getOrCreateSocket } from '../services/globalSocket';

const VideoCallScreen = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { error, success, warning } = useModalAlert();
  const { user, callType = 'audio', callId: incomingCallId, isIncoming = false } = route.params;
  const [callStatus, setCallStatus] = useState(isIncoming ? 'connected' : 'ringing');
  const [cameraPermission, setCameraPermission] = useState(null);
  const [audioPermission, setAudioPermission] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(callType !== 'video');
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState(incomingCallId || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [remoteIsMuted, setRemoteIsMuted] = useState(false);
  const socketRef = useRef(null);
  const cameraRef = useRef(null);
  const callTimerRef = useRef(null);
  const initializeRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (initializeRef.current) return;
    initializeRef.current = true;

    let isMounted = true;
    let cleanupSocketListeners = null;

    const setupCall = async () => {
      const cleanup = await initializeCall();
      if (isMounted) {
        cleanupSocketListeners = cleanup;
      } else if (cleanup) {
        cleanup();
      }
    };

    setupCall();
    requestPermissions();

    return () => {
      isMounted = false;
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      stopAudio();
      if (cleanupSocketListeners) cleanupSocketListeners();
    };
  }, []);

  useEffect(() => {
    if (callStatus === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStatus]);

  useEffect(() => {
    if (callStatus === 'ringing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [callStatus, pulseAnim]);

  const requestPermissions = async () => {
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(cameraStatus.status === 'granted');

    const audioStatus = await Audio.requestPermissionsAsync();
    setAudioPermission(audioStatus.status === 'granted');

    if (audioStatus.status !== 'granted') {
      error('Ошибка', 'Требуется доступ к микрофону для звонков');
    }
  };

  const initializeCall = async () => {
    try {
      const currentUserData = await AsyncStorage.getItem('user');
      const currentUserObj = JSON.parse(currentUserData);
      setCurrentUser(currentUserObj);

      console.log('🔌 Получаем глобальный socket...');
      const socket = await getOrCreateSocket();

      socketRef.current = socket;

      console.log('✅ Используем существующее соединение для звонка');
      
      if (!isIncoming) {
        const newCallId = `${currentUserObj.id}_${user.id}_${Date.now()}`;
        setCallId(newCallId);
        
        console.log(`📞 Инициируем звонок: ${currentUserObj.id} → ${user.id}`);
        console.log(`   Тип звонка: ${callType}`);
        console.log(`   Call ID: ${newCallId}`);
        
        socket.emit('call_initiate', {
          from_user_id: currentUserObj.id,
          to_user_id: user.id,
          call_type: callType,
          from_user: {
            id: currentUserObj.id,
            username: currentUserObj.username
          }
        });

        startAudio();
      } else {
        console.log(`📞 Входящий звонок от ${user.username}`);
        startAudio();
      }

      let isMounted = true;

      const handleCallAccepted = (data) => {
        if (!isMounted) return;
        console.log('📞 Вызов принят');
        setCallStatus('connected');
      };

      const handleCallRejected = (data) => {
        if (!isMounted) return;
        console.log('❌ Вызов отклонен');
        error('Вызов отклонен', 'Пользователь отклонил ваш вызов');
        endCall();
      };

      const handleCallEnded = (data) => {
        if (!isMounted) return;
        console.log('📴 Вызов закончился');
        if (data.duration) {
          console.log(`   Длительность: ${data.duration} сек`);
        }
        setCallStatus('ended');
        setTimeout(() => {
          if (isMounted) endCall();
        }, 500);
      };

      const handleCallOfflinePushSent = (data) => {
        if (!isMounted) return;
        console.log('📬 Push-уведомление отправлено оффлайн пользователю');
        console.log('⏳ Ожидаем ответа... (15 сек)');
      };

      const handleCallUserOffline = (data) => {
        if (!isMounted) return;
        console.log('⚠️ Пользователь оффлайн:', data.message);
        warning('Ошибка', data.message);
        setTimeout(() => {
          if (isMounted) endCall();
        }, 2000);
      };

      const handleCallMissed = (data) => {
        if (!isMounted) return;
        console.log('📵 Пропущенный вызов');
        setCallStatus('ended');
        setTimeout(() => {
          if (isMounted) endCall();
        }, 1000);
      };

      const handleCallMuteStatus = (data) => {
        if (!isMounted) return;
        console.log('🔇 Другой пользователь', data.is_muted ? 'включил' : 'выключил', 'муте');
        setRemoteIsMuted(data.is_muted);
      };

      socket.on('call_accepted', handleCallAccepted);
      socket.on('call_rejected', handleCallRejected);
      socket.on('call_ended', handleCallEnded);
      socket.on('call_user_offline_push_sent', handleCallOfflinePushSent);
      socket.on('call_user_offline', handleCallUserOffline);
      socket.on('call_missed', handleCallMissed);
      socket.on('call_mute_status', handleCallMuteStatus);

      return () => {
        isMounted = false;
        socket.off('call_accepted', handleCallAccepted);
        socket.off('call_rejected', handleCallRejected);
        socket.off('call_ended', handleCallEnded);
        socket.off('call_user_offline_push_sent', handleCallOfflinePushSent);
        socket.off('call_user_offline', handleCallUserOffline);
        socket.off('call_missed', handleCallMissed);
        socket.off('call_mute_status', handleCallMuteStatus);
      };

    } catch (err) {
      console.error('❌ Ошибка инициализации вызова:', err);
      error('Ошибка', 'Не удалось инициировать вызов');
      try {
        if (navigation.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation.replace('Main');
        }
      } catch (navErr) {
        console.log('Ошибка навигации:', navErr);
      }
    }
  };

  const startAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: 2,
        playsInSilentModeIOS: true,
        interruptionModeAndroid: 2,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      console.log('🔊 Аудио режим активирован');
    } catch (err) {
      console.error('❌ Ошибка активации аудио:', err);
    }
  };

  const stopAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (err) {
      console.error('❌ Ошибка деактивации аудио:', err);
    }
  };

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    
    if (socketRef.current && user.id) {
      socketRef.current.emit('call_mute_toggle', {
        is_muted: newMuteState,
        to_user_id: user.id,
      });
      console.log(`🔇 Муте ${newMuteState ? 'включен' : 'выключен'}`);
    }
  };

  const toggleCamera = () => {
    if (callType === 'video') {
      setIsCameraOff(!isCameraOff);
      console.log(`📹 Камера ${isCameraOff ? 'включена' : 'выключена'}`);
    }
  };

  const endCall = async () => {
    try {
      if (socketRef.current && callId && user.id) {
        console.log(`📴 Завершаем звонок (Call ID: ${callId})`);
        socketRef.current.emit('call_end', {
          to_user_id: user.id,
        });
      }
      await stopAudio();
      setCallStatus('ended');
      setTimeout(() => {
        try {
          if (navigation.canGoBack?.()) {
            navigation.goBack();
          } else {
            navigation.replace('Main');
          }
        } catch (err) {
          console.log('Ошибка навигации:', err);
        }
      }, 500);
    } catch (err) {
      console.error('❌ Ошибка завершения вызова:', err);
      try {
        if (navigation.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation.replace('Main');
        }
      } catch (navErr) {
        console.log('Ошибка навигации при ошибке:', navErr);
      }
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {callType === 'video' && cameraPermission && !isCameraOff && cameraRef && (
        <Camera 
          ref={cameraRef}
          style={styles.camera}
          type={Camera.Constants?.Type?.front || 'front'}
        />
      )}

      {callType === 'video' && !isCameraOff && (
        <View style={styles.overlay} />
      )}

      {(callType !== 'video' || isCameraOff) && (
        <View style={[styles.backgroundGradient, { backgroundColor: theme.surface }]} />
      )}

      {/* Основной контент - по центру */}
      <View style={styles.contentWrapper}>
        {/* Имя пользователя */}
        <Text style={[styles.userName, { color: theme.text }]}>{user.username}</Text>

        {/* Статус вызова - рингинг */}
        {callStatus === 'ringing' && (
          <View style={styles.statusSection}>
            <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
              {isIncoming ? 'Входящий вызов' : 'Ожидание ответа...'}
            </Text>
            
            {/* Анимированная пульсирующая точка */}
            <Animated.View 
              style={[
                styles.pulsingIndicator,
                { 
                  backgroundColor: theme.primary,
                  transform: [{ scale: pulseAnim }],
                }
              ]} 
            />
          </View>
        )}

        {/* Статус вызова - подключено */}
        {callStatus === 'connected' && (
          <View style={styles.statusSection}>
            <View style={[styles.connectionBadge, { backgroundColor: theme.success + '15' }]}>
              <View style={[styles.connectionDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.durationText, { color: theme.success }]}>
                {formatTime(callDuration)}
              </Text>
            </View>
            
            {remoteIsMuted && (
              <View style={[styles.remoteStatusBadge, { backgroundColor: theme.accent + '15' }]}>
                <Ionicons name="mic-off" size={12} color={theme.accent} />
                <Text style={[styles.remoteStatusText, { color: theme.accent }]}>
                  Микрофон выключен
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Кнопки управления - внизу */}
      <View style={styles.bottomControls}>
        {callStatus === 'ringing' && !isIncoming && (
          <View style={styles.controlsRow}>
            <TouchableOpacity 
              style={[styles.button, styles.endButton, { backgroundColor: theme.accent }]}
              onPress={endCall}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {callStatus === 'connected' && (
          <View style={styles.controlsGrid}>
            <View style={styles.controlsRow}>
              {callType === 'video' && (
                <TouchableOpacity 
                  style={[
                    styles.smallButton,
                    { backgroundColor: isCameraOff ? theme.accent : theme.primary }
                  ]}
                  onPress={toggleCamera}
                  activeOpacity={0.8}
                >
                  <Ionicons 
                    name={isCameraOff ? 'videocam-off' : 'videocam'} 
                    size={20} 
                    color="#fff" 
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[
                  styles.smallButton,
                  { backgroundColor: isMuted ? theme.accent : theme.primary }
                ]}
                onPress={toggleMute}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name={isMuted ? 'mic-off' : 'mic'} 
                  size={20} 
                  color="#fff" 
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.button, styles.endButton, { backgroundColor: theme.accent }]}
              onPress={endCall}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  
  camera: {
    ...StyleSheet.absoluteFillObject,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },

  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },

  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  userName: {
    fontSize: 38,
    fontWeight: '800',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  statusSection: {
    alignItems: 'center',
    gap: 18,
  },

  statusLabel: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  pulsingIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 8,
  },

  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    marginTop: 12,
  },

  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  durationText: {
    fontSize: 15,
    fontWeight: '600',
  },

  remoteStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
    marginTop: 12,
  },

  remoteStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },

  bottomControls: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 24,
    alignItems: 'center',
  },

  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },

  controlsGrid: {
    gap: 20,
    width: '100%',
    alignItems: 'center',
  },

  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },

  smallButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  endButton: {
    transform: [{ rotate: '135deg' }],
  },
});

export default VideoCallScreen;
