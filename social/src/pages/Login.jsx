import { useState } from 'react';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import styles from './Login.module.css';

export default function Login() {
  const [mode, setMode] = useState('login');

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.content}>
        {mode === 'login'
          ? <LoginForm onSwitch={() => setMode('register')} />
          : <RegisterForm onSwitch={() => setMode('login')} />
        }
      </div>
    </div>
  );
}
