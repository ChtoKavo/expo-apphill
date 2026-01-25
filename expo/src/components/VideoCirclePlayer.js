import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { getCachedVideo, fixMediaUrl } from '../services/mediaCache';

const { width } = Dimensions.get('window');

// Размеры видеокружка в разных контекстах
const SIZES = {
  message: Math.min(width * 0.55, 200),    // В сообщении
  fullscreen: Math.min(width * 0.85, 320), // Полноэкранный просмотр
};

const VideoCirclePlayer = ({
  uri,
  duration = 0,
  size = 'message', // 'message' | 'fullscreen'
  isCurrentUser = false,
  style,
  theme,
  onLongPress,
  messageId,
  isActive = false,
  onPlay,
  onStop,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(duration);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cachedUri, setCachedUri] = useState(null); // Локальный URI из кэша
  
  const videoRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const circleSize = SIZES[size] || SIZES.message;
  
  // SVG параметры для кругового прогресса
  const strokeWidth = 4;
  const radius = (circleSize / 2) + 6;
  const circumference = 2 * Math.PI * radius;
  const svgSize = circleSize + 20;
  const center = svgSize / 2;

  // Загрузка видео из кэша при монтировании
  useEffect(() => {
    if (!uri) return;
    
    let isMounted = true;
    
    getCachedVideo(uri).then(localUri => {
      if (isMounted && localUri) {
        setCachedUri(localUri);
      }
    });
    
    return () => {
      isMounted = false;
    };
  }, [uri]);

  // PanResponder для перетаскивания прогресса
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        handleSeek(evt);
      },
      onPanResponderMove: (evt) => {
        handleSeek(evt);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  // Расчёт позиции при перетаскивании
  const handleSeek = async (evt) => {
    if (!videoRef.current || !videoDuration) return;
    
    const { locationX, locationY } = evt.nativeEvent;
    
    // Вычисляем угол от центра
    const dx = locationX - center;
    const dy = locationY - center;
    let angle = Math.atan2(dy, dx) + Math.PI / 2; // Начинаем с верха
    
    if (angle < 0) angle += 2 * Math.PI;
    
    const progress = angle / (2 * Math.PI);
    const newPosition = progress * videoDuration * 1000;
    
    try {
      videoRef.current.setPositionAsync(newPosition);
      setCurrentPosition(newPosition);
      progressAnim.setValue(progress);
    } catch (error) {
      console.error('Ошибка перемотки:', error);
    }
  };

  // Управление воспроизведением извне (когда другой кружок запускается)
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (!isActive && isPlaying) {
      // Другой кружок запустился - останавливаем этот
      videoRef.current.pauseAsync();
      videoRef.current.setPositionAsync(0);
    }
  }, [isActive]);

  // Пульсация при загрузке
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.95,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isLoading]);

  // Обновление прогресса воспроизведения
  // Обновление прогресса воспроизведения (оптимизированное)
  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      // Обновляем loading только если изменилось
      if (isLoading) setIsLoading(false);
      
      // Обновляем isPlaying только если изменилось
      if (status.isPlaying !== isPlaying) {
        setIsPlaying(status.isPlaying);
      }
      
      if (!isDragging && status.durationMillis) {
        // Обновляем прогресс напрямую без лишних setState
        const progress = status.positionMillis / status.durationMillis;
        progressAnim.setValue(progress);
        
        // Обновляем позицию реже (только каждые 200мс примерно)
        const newPos = Math.floor(status.positionMillis / 200) * 200;
        if (Math.abs(newPos - currentPosition) >= 200) {
          setCurrentPosition(status.positionMillis);
        }
        
        // Длительность обновляем только один раз
        if (videoDuration === 0) {
          setVideoDuration(status.durationMillis / 1000);
        }
      }
      
      // Автоповтор
      if (status.didJustFinish) {
        videoRef.current?.replayAsync();
      }
    }
    
    if (status.error) {
      console.error('Ошибка видео:', status.error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  // Быстрое переключение play/pause без блокирующих операций
  const togglePlayPause = () => {
    if (!videoRef.current || isDragging || isLoading) return;
    
    if (isPlaying) {
      // Ставим на паузу
      videoRef.current.pauseAsync();
      onStop?.();
    } else {
      // Уведомляем родителя (остановит другие кружки)
      onPlay?.();
      // Запускаем
      videoRef.current.playAsync();
    }
  };

  // Быстрое переключение звука
  const toggleMute = () => {
    if (!videoRef.current) return;
    
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.setIsMutedAsync(newMuted);
  };

  const openFullscreen = () => {
    setIsFullscreen(true);
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Круговой прогресс-бар с SVG
  const renderProgressRing = () => {
    const progress = videoDuration > 0 ? currentPosition / (videoDuration * 1000) : 0;
    const strokeDashoffset = circumference * (1 - progress);
    const progressColor = isCurrentUser ? '#fff' : (theme?.primary || '#60A5FA');
    
    // Позиция ползунка (точки)
    const angle = progress * 2 * Math.PI - Math.PI / 2;
    const knobX = center + radius * Math.cos(angle);
    const knobY = center + radius * Math.sin(angle);

    return (
      <View 
        style={[styles.progressRingContainer, { width: svgSize, height: svgSize }]}
        {...panResponder.panHandlers}
      >
        <Svg width={svgSize} height={svgSize}>
          {/* Фоновое кольцо */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Прогресс кольцо */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
          {/* Ползунок (точка) */}
          {(isPlaying || isDragging) && (
            <Circle
              cx={knobX}
              cy={knobY}
              r={isDragging ? 10 : 7}
              fill={progressColor}
            />
          )}
        </Svg>
      </View>
    );
  };

  if (hasError) {
    return (
      <View style={[styles.container, { width: circleSize, height: circleSize }, style]}>
        <View style={[styles.errorContainer, { borderRadius: circleSize / 2 }]}>
          <Ionicons name="alert-circle" size={32} color="#EF4444" />
          <Text style={styles.errorText}>Ошибка загрузки</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, style]}>
        <Animated.View
          style={[
            styles.videoWrapper,
            {
              width: svgSize,
              height: svgSize,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          {/* Круговой прогресс с возможностью перетаскивания */}
          {renderProgressRing()}
          
          {/* Видео по центру */}
          <TouchableOpacity
            onPress={togglePlayPause}
            onLongPress={onLongPress}
            activeOpacity={0.9}
            style={[
              styles.videoContainer,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
              },
            ]}
          >
            <Video
              ref={videoRef}
              source={{ uri: cachedUri || fixMediaUrl(uri) }}
              style={[
                styles.video,
                {
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleSize / 2,
                },
              ]}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              isLooping={true}
              isMuted={isMuted}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              onLoadStart={() => setIsLoading(true)}
              onLoad={() => setIsLoading(false)}
              onError={(error) => {
                console.error('Video error:', error);
                setHasError(true);
              }}
              progressUpdateIntervalMillis={250}
            />
            
            {/* Индикатор загрузки */}
            {isLoading && (
              <View style={[styles.loadingOverlay, { borderRadius: circleSize / 2 }]}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            
            {/* Кнопка play */}
            {!isLoading && !isPlaying && (
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                </View>
              </View>
            )}
            
            {/* Время внизу видео */}
            <View style={styles.timeOverlay}>
              <Text style={styles.timeText}>
                {formatTime(currentPosition / 1000)} / {formatTime(videoDuration)}
              </Text>
            </View>
          </TouchableOpacity>
          
          {/* Кнопка звука */}
          {isPlaying && (
            <TouchableOpacity
              style={styles.muteButton}
              onPress={toggleMute}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons 
                name={isMuted ? "volume-mute" : "volume-high"} 
                size={14} 
                color="#fff" 
              />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {/* Полноэкранный просмотр */}
      <Modal
        visible={isFullscreen}
        transparent
        animationType="fade"
        onRequestClose={closeFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity
            style={styles.fullscreenCloseButton}
            onPress={closeFullscreen}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          <View style={[
            styles.fullscreenVideoWrapper,
            {
              width: SIZES.fullscreen,
              height: SIZES.fullscreen,
              borderRadius: SIZES.fullscreen / 2,
            },
          ]}>
            <Video
              source={{ uri: cachedUri || fixMediaUrl(uri) }}
              style={[
                styles.video,
                {
                  width: SIZES.fullscreen,
                  height: SIZES.fullscreen,
                  borderRadius: SIZES.fullscreen / 2,
                },
              ]}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isLooping={true}
              isMuted={isMuted}
              useNativeControls={false}
            />
            
            <View style={styles.fullscreenControls}>
              <TouchableOpacity
                style={styles.fullscreenControlButton}
                onPress={toggleMute}
              >
                <Ionicons 
                  name={isMuted ? "volume-mute" : "volume-high"} 
                  size={24} 
                  color="#fff" 
                />
              </TouchableOpacity>
            </View>
          </View>
          
          <Text style={styles.fullscreenHint}>Нажмите × чтобы закрыть</Text>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 4,
  },
  videoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    overflow: 'hidden',
  },
  video: {
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  muteButton: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderStyle: 'dashed',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fullscreenVideoWrapper: {
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  fullscreenControls: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  fullscreenControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenHint: {
    position: 'absolute',
    bottom: 50,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
});

export default VideoCirclePlayer;
