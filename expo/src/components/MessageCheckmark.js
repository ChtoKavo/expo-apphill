import React from 'react';
import { Text } from 'react-native';

export const MessageCheckmark = ({ isRead, isDouble, style }) => {
  return (
    <Text
      style={[
        {
          fontSize: 13,
          marginLeft: 4,
          fontWeight: isDouble ? '700' : '600',
          letterSpacing: 0.5,
          color: '#FFFFFF', // Белый цвет
          opacity: isRead ? 1 : 0.5,
        },
        style,
      ]}
    >
      {isDouble ? '✓✓' : '✓'}
    </Text>
  );
};

export default MessageCheckmark;
