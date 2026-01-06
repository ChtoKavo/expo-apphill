import React, { createContext, useState, useCallback } from 'react';
import ModalAlert from '../components/ModalAlert';

export const ModalAlertContext = createContext();

export const ModalAlertProvider = ({ children }) => {
  const [state, setState] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    buttons: [],
    autoClose: true,
    autoCloseDuration: 2000,
  });

  const show = useCallback((config) => {
    setState((prev) => ({
      ...prev,
      visible: true,
      type: config.type || 'info',
      title: config.title || '',
      message: config.message || '',
      buttons: config.buttons || [],
      autoClose: config.autoClose !== false,
      autoCloseDuration: config.autoCloseDuration || 2000,
    }));
  }, []);

  const success = useCallback((title, message, config = {}) => {
    show({
      type: 'success',
      title,
      message,
      ...config,
    });
  }, [show]);

  const error = useCallback((title, message, config = {}) => {
    show({
      type: 'error',
      title,
      message,
      autoClose: false, // Ошибки обычно не закрываются автоматически
      ...config,
    });
  }, [show]);

  const warning = useCallback((title, message, config = {}) => {
    show({
      type: 'warning',
      title,
      message,
      ...config,
    });
  }, [show]);

  const info = useCallback((title, message, config = {}) => {
    show({
      type: 'info',
      title,
      message,
      ...config,
    });
  }, [show]);

  const close = useCallback(() => {
    setState((prev) => ({
      ...prev,
      visible: false,
    }));
  }, []);

  const value = {
    show,
    success,
    error,
    warning,
    info,
    close,
  };

  return (
    <ModalAlertContext.Provider value={value}>
      {children}
      <ModalAlert
        visible={state.visible}
        type={state.type}
        title={state.title}
        message={state.message}
        buttons={state.buttons}
        autoClose={state.autoClose}
        autoCloseDuration={state.autoCloseDuration}
        onClose={close}
      />
    </ModalAlertContext.Provider>
  );
};

export const useModalAlert = () => {
  const context = React.useContext(ModalAlertContext);
  if (!context) {
    throw new Error(
      'useModalAlert должен быть использован внутри ModalAlertProvider'
    );
  }
  return context;
};
