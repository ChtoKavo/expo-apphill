import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useModalAlert } from '../contexts/ModalAlertContext';
import { getOrCreateSocket } from '../services/globalSocket';

const IncomingCallModal = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { error, success } = useModalAlert();
  const { caller, callType = 'audio', callId } = route.params;
  const [ringing, setRinging] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    initializeSocket();
    playRingTone();

    return () => {
      stopRingTone();
      // Не отключаем сокет - он глобальный!
    };
  }, []);

  const initializeSocket = async () => {
    try {
      console.log('🔌 Получаем глобальный socket для входящего звонка...');
      
      // ⭐ ИСПОЛЬЗУЕМ ГЛОБАЛЬНЫЙ СОКЕТ
      const socket = await getOrCreateSocket();
      socketRef.current = socket;

      console.log('✅ Используем существующее соединение для входящего звонка');
    } catch (err) {
      console.error('❌ Ошибка инициализации сокета:', err);
    }
  };

  const playRingTone = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: 2,
        playsInSilentModeIOS: true,
        interruptionModeAndroid: 2,
      });
      // Здесь можно воспроизвести звук рингтона, но требуется аудио файл
      console.log('📞 Рингтон...');
    } catch (err) {
      console.error('❌ Ошибка воспроизведения рингтона:', err);
    }
  };

  const stopRingTone = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (err) {
      console.error('❌ Ошибка остановки рингтона:', err);
    }
  };

  const acceptCall = async () => {
    setRinging(false);
    
    if (socketRef.current && callId) {
      console.log(`✅ Принимаем звонок (Call ID: ${callId})`);
      socketRef.current.emit('call_accepted', {
        call_id: callId,
        to_user_id: caller.id,
      });
    }

    await stopRingTone();
    
    navigation.replace('VideoCall', {
      user: caller,
      callType,
      callId,
      isIncoming: true
    });
  };

  const rejectCall = async () => {
    if (socketRef.current && callId) {
      console.log(`❌ Отклоняем звонок (Call ID: ${callId})`);
      socketRef.current.emit('call_rejected', {
        call_id: callId,
        to_user_id: caller.id,
      });
    }

    await stopRingTone();
    navigation.dismiss();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Ionicons name="call" size={80} color="#667eea" style={styles.callIcon} />
        
        <Text style={[styles.callerName, { color: theme.text }]}>
          {caller.username}
        </Text>
        
        <Text style={[styles.callType, { color: theme.textSecondary }]}>
          {callType === 'video' ? '📹 Видеозвонок' : '📞 Аудиозвонок'}
        </Text>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.rejectButton]}
            onPress={rejectCall}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.acceptButton]}
            onPress={acceptCall}
          >
            <Ionicons name="call" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  callIcon: {
    marginBottom: 30,
    opacity: 0.8,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  callType: {
    fontSize: 16,
    marginBottom: 50,
    textAlign: 'center',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 20,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
});

export default IncomingCallModal;
