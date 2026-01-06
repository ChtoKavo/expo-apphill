import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { showLocalNotification } from '../services/notifications';

export default function TestNotifications() {
  const testSimple = () => {
    showLocalNotification('Тест', 'Простое уведомление');
  };

  const testMessage = () => {
    showLocalNotification('Новое сообщение', 'Привет! Как дела?', { type: 'message' });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={testSimple}>
        <Text style={styles.buttonText}>Простое уведомление</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testMessage}>
        <Text style={styles.buttonText}>Уведомление сообщения</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  button: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});