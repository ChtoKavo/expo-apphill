/**
 * Компонент кэшируемого видео
 * Автоматически загружает и кэширует видео локально
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { getCachedMedia, preloadMedia, fixMediaUrl } from '../services/mediaCache';

const CachedVideo = memo(({
  source,
  style,
  resizeMode = 'contain',
  useNativeControls = true,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  volume = 1.0,
  rate = 1.0,
  onLoad,
  onError,
  onPlaybackStatusUpdate,
  showLoader = true,
  loaderColor = '#007AFF',
  placeholderColor = '#1A1A1A',
  ...props
}) => {
  const [cachedUri, setCachedUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const videoRef = useRef(null);

  // Получаем URI из source
  const remoteUri = typeof source === 'object' ? source.uri : source;

  useEffect(() => {
    if (!remoteUri) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    // Загружаем из кэша или скачиваем
    getCachedMedia(remoteUri, 'video')
      .then((localUri) => {
        if (isMounted) {
          setCachedUri(localUri);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('CachedVideo cache error:', err);
          // При ошибке используем исправленный URL
          setCachedUri(fixMediaUrl(remoteUri));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [remoteUri]);

  const handleLoad = (data) => {
    setLoading(false);
    setError(null);
    onLoad?.(data);
  };

  const handleError = (err) => {
    setLoading(false);
    
    // Извлекаем читаемое сообщение об ошибке
    let errorMessage = 'Не удалось загрузить видео';
    if (err) {
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err.error) {
        // expo-av формат: { error: "message" } или { error: { message: "..." } }
        errorMessage = typeof err.error === 'string' ? err.error : (err.error?.message || errorMessage);
      } else if (err.message) {
        errorMessage = err.message;
      }
    }
    
    console.log('CachedVideo error:', errorMessage, 'raw:', err);
    
    // При ошибке кэшированного файла - пробуем исправленный URL
    const fixedUri = fixMediaUrl(remoteUri);
    if (cachedUri !== fixedUri && !retrying) {
      console.log('CachedVideo: trying fixed URL after cache error');
      setRetrying(true);
      setCachedUri(fixedUri);
      return;
    }
    
    setError(errorMessage);
    onError?.(err);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetrying(false);
    
    // Перезагружаем из кэша
    getCachedMedia(remoteUri, 'video')
      .then((localUri) => {
        setCachedUri(localUri);
      })
      .catch(() => {
        setCachedUri(remoteUri);
      });
  };

  if (!remoteUri) {
    return (
      <View style={[styles.placeholder, style, { backgroundColor: placeholderColor }]}>
        <Ionicons name="videocam-off-outline" size={32} color="#666" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, style, { backgroundColor: placeholderColor }]}>
        <Ionicons name="alert-circle-outline" size={32} color="#FF6B6B" />
        <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={style}>
      {cachedUri ? (
        <Video
          ref={videoRef}
          {...props}
          source={{ uri: cachedUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          useNativeControls={useNativeControls}
          shouldPlay={shouldPlay}
          isLooping={isLooping}
          isMuted={isMuted}
          volume={volume}
          rate={rate}
          onLoad={handleLoad}
          onError={handleError}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          progressUpdateIntervalMillis={500}
        />
      ) : null}
      
      {loading && showLoader && (
        <View style={[StyleSheet.absoluteFill, styles.loaderContainer, { backgroundColor: placeholderColor }]}>
          <ActivityIndicator size="large" color={loaderColor} />
          <Text style={styles.loadingText}>Загрузка видео...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 6,
  },
});

// Функция для предзагрузки видео
CachedVideo.preload = (urls) => {
  urls.forEach(url => {
    if (url) preloadMedia(url, 'video');
  });
};

export default CachedVideo;
