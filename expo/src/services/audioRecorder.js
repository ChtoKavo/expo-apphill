import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export class AudioRecorder {
  constructor() {
    this.recording = null;
    this.sound = null;
    this.isRecording = false;
    this.isPaused = false;
    this.recordingDuration = 0;
    this.recordingStartTime = null;
    this.durationUpdateInterval = null;
  }

  /**
   * Инициализация аудиосессии
   */
  async initialize() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      return true;
    } catch (error) {
      console.error('❌ Ошибка инициализации аудиосессии:', error);
      return false;
    }
  }

  /**
   * Начать запись голоса
   */
  async startRecording() {
    try {
      if (this.isRecording) {
        console.log('⚠️ Запись уже идет');
        return false;
      }

      // Инициализируем аудиосессию если необходимо
      if (!this.recording) {
        await this.initialize();
      }

      this.recording = new Audio.Recording();
      
      await this.recording.prepareToRecordAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );

      await this.recording.startAsync();
      
      this.isRecording = true;
      this.isPaused = false;
      this.recordingDuration = 0;
      this.recordingStartTime = Date.now();

      // Обновляем длительность записи каждую секунду
      this.durationUpdateInterval = setInterval(() => {
        this.recordingDuration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      }, 100);

      console.log('🎤 Запись голоса начата');
      return true;
    } catch (error) {
      console.error('❌ Ошибка при начале записи:', error);
      this.isRecording = false;
      return false;
    }
  }

  /**
   * Остановить запись и получить путь к файлу
   */
  async stopRecording() {
    try {
      if (!this.isRecording || !this.recording) {
        console.log('⚠️ Запись не идет');
        return null;
      }

      if (this.durationUpdateInterval) {
        clearInterval(this.durationUpdateInterval);
      }

      await this.recording.stopAndUnloadAsync();
      
      const recordedUri = this.recording.getURI();
      this.isRecording = false;
      this.isPaused = false;
      
      console.log('🛑 Запись остановлена:', recordedUri);
      console.log('⏱️ Длительность:', this.recordingDuration, 'сек');

      // Очищаем текущую запись
      const tempRecording = this.recording;
      this.recording = null;

      return {
        uri: recordedUri,
        duration: this.recordingDuration,
        filename: `voice_${Date.now()}.m4a`
      };
    } catch (error) {
      console.error('❌ Ошибка при остановке записи:', error);
      this.isRecording = false;
      return null;
    }
  }

  /**
   * Отменить запись
   */
  async cancelRecording() {
    try {
      if (this.durationUpdateInterval) {
        clearInterval(this.durationUpdateInterval);
      }

      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }

      this.isRecording = false;
      this.isPaused = false;
      this.recordingDuration = 0;

      console.log('❌ Запись отменена');
      return true;
    } catch (error) {
      console.error('❌ Ошибка при отмене записи:', error);
      return false;
    }
  }

  /**
   * Загрузить голосовое сообщение на сервер
   */
  async uploadVoiceMessage(recordingUri, mediaAPI) {
    try {
      console.log('📤 Загружаем голос с URI:', recordingUri);
      
      // Используем mediaAPI с типом 'voice'
      const uploadResponse = await mediaAPI.uploadMedia(recordingUri, 'voice');
      
      console.log('✅ Голосовое сообщение загружено:', uploadResponse.data.url);
      
      return uploadResponse.data;
    } catch (error) {
      console.error('❌ Ошибка загрузки голосового сообщения:', error);
      throw error;
    }
  }

  /**
   * Воспроизвести голосовое сообщение
   */
  async playVoiceMessage(uri, onPlaybackStatusUpdate = null) {
    try {
      if (this.sound) {
        // Если что-то уже воспроизводится, останавливаем
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      }

      // Устанавливаем правильный режим для воспроизведения
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      this.sound = new Audio.Sound();
      
      if (onPlaybackStatusUpdate) {
        this.sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      }

      await this.sound.loadAsync({ uri });
      await this.sound.playAsync();

      console.log('🔊 Воспроизведение голосового сообщения');
      return true;
    } catch (error) {
      console.error('❌ Ошибка воспроизведения голосового сообщения:', error);
      return false;
    }
  }

  /**
   * Остановить воспроизведение
   */
  async stopPlayback() {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
      console.log('⏹️ Воспроизведение остановлено');
      return true;
    } catch (error) {
      console.error('❌ Ошибка остановки воспроизведения:', error);
      return false;
    }
  }

  /**
   * Форматировать время в MM:SS
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Получить статус записи
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      duration: this.recordingDuration,
      formatted: this.formatDuration(this.recordingDuration),
    };
  }

  /**
   * Очистить ресурсы
   */
  async cleanup() {
    try {
      if (this.durationUpdateInterval) {
        clearInterval(this.durationUpdateInterval);
      }

      if (this.isRecording && this.recording) {
        await this.stopRecording();
      }

      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }

      console.log('🧹 Ресурсы аудиорекордера очищены');
    } catch (error) {
      console.error('❌ Ошибка при очистке ресурсов:', error);
    }
  }
}

// Экспортируем синглтон
export const audioRecorder = new AudioRecorder();

export default audioRecorder;
