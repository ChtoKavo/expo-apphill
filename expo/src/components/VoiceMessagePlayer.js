import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

export const VoiceMessagePlayer = ({
  uri,
  duration = 0,
  theme,
  isCurrentUser = false,
  style = {},
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sound, setSound] = useState(null);
  const [loading, setLoading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      // Очищаем звук при размонтировании
      if (sound) {
        sound.stopAsync();
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const playVoiceMessage = async () => {
    try {
      setLoading(true);

      // Если уже что-то воспроизводится, останавливаем
      if (sound) {
        await sound.stopAsync();
        setIsPlaying(false);
        setCurrentTime(0);
        setSound(null);
        setLoading(false);
        progressAnim.setValue(0);
        return;
      }

      // Устанавливаем правильный режим для воспроизведения
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setIsPlaying(true);
      setLoading(false);
    } catch (error) {
      console.error('❌ Ошибка воспроизведения голосового сообщения:', error);
      setLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.log(`Encountered an error while updating playback status for Sound: ${status.error}`);
        stopPlayback();
      }
      return;
    }

    if (status.isPlaying) {
      setCurrentTime(status.positionMillis / 1000);
      const progress = status.positionMillis / status.durationMillis;
      progressAnim.setValue(progress);
    }

    if (status.didJustFinish && !status.isLooping) {
      stopPlayback();
    }
  };

  const stopPlayback = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (error) {
        console.error('Ошибка остановки:', error);
      }
    }
    setSound(null);
    setIsPlaying(false);
    setCurrentTime(0);
    progressAnim.setValue(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayDuration = duration || 0;
  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isCurrentUser ? 'rgba(102, 126, 234, 0.2)' : 'rgba(0, 0, 0, 0.1)',
        },
        style,
      ]}
    >
      {/* Кнопка воспроизведения */}
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: isCurrentUser ? '#667eea' : 'rgba(0, 0, 0, 0.2)' }]}
        onPress={playVoiceMessage}
        disabled={loading}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color="#fff"
        />
      </TouchableOpacity>

      {/* Прогресс-бар */}
      <View style={styles.progressContainer}>
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: widthInterpolated,
              backgroundColor: isCurrentUser ? '#667eea' : 'rgba(102, 126, 234, 0.6)',
            },
          ]}
        />
      </View>

      {/* Время */}
      <Text style={[styles.timeText, { color: isCurrentUser ? '#fff' : '#666' }]}>
        {formatTime(isPlaying ? currentTime : displayDuration)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    maxWidth: '100%',
    minWidth: 180,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 1.5,
    elevation: 1,
  },
  progressContainer: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
    minWidth: 60,
  },
  progressBar: {
    height: '100%',
    borderRadius: 1.5,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    minWidth: 30,
    textAlign: 'right',
  },
});

export default VoiceMessagePlayer;
