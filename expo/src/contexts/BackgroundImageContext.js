import React, { createContext, useContext, useState } from 'react';

const BackgroundImageContext = createContext();

export const useBackgroundImage = () => {
  const context = useContext(BackgroundImageContext);
  if (!context) {
    throw new Error('useBackgroundImage must be used within BackgroundImageProvider');
  }
  return context;
};

export const BackgroundImageProvider = ({ children }) => {
  const [backgroundImage, setBackgroundImage] = useState(null);

  return (
    <BackgroundImageContext.Provider value={{ backgroundImage, setBackgroundImage }}>
      {children}
    </BackgroundImageContext.Provider>
  );
};
