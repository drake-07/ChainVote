import { useState } from 'react';
import { supabase } from './supabaseClient';
import './Auth.css';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 🔥 NUEVO: estado recuperación contraseña
  const [resetLoading, setResetLoading] = useState(false);

  const isValidEmail = (value: string) =>
    /\S+@\S+\.\S+/.test(value);

  const passwordChecks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const passwordsMatch =
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const isValidPassword = (value: string) => {
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?]).{8,}$/.test(
      value
    );
  };

  const ensureProfile = async (
    userId: string,
    firstName?: string,
    lastName?: string,
    userNm?: string
  ) => {
    const profile: any = {
      id: userId,
      is_admin: false,
      created_at: new Date().toISOString(),
    };

    if (firstName) profile.name = firstName;
    if (lastName) profile.surname = lastName;
    if (userNm) profile.username = userNm;

    const { error } = await supabase.from('users').upsert(profile, {
      onConflict: 'id',
    });

    if (error) {
      console.warn(
        'No se pudo crear/actualizar profile public.users',
        error
      );
    }

    return error;
  };

  // 🔥 NUEVO: enviar email recuperación contraseña
  const handlePasswordReset = async () => {
    if (!email) {
      setMessage('Introduce tu correo para recuperar la contraseña');
      return;
    }

    setResetLoading(true);
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin, // puedes cambiar a /reset-password si tienes página
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Te hemos enviado un email para restablecer la contraseña');
    }

    setResetLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!isValidEmail(email)) {
      setMessage('Ingresa un correo válido');
      return;
    }

    if (!isLogin) {
      if (!isValidPassword(password)) {
        setMessage(
          'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial'
        );
        return;
      }

      if (password !== confirmPassword) {
        setMessage('Las contraseñas no coinciden');
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setMessage('Inicio de sesión correcto');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              username: username,
            },
          },
        });

        if (error) throw error;

        if (data?.user?.id) {
          await ensureProfile(
            data.user.id,
            firstName,
            lastName,
            username
          );

          setMessage('Cuenta creada correctamente');
        }
      }
    } catch (error: any) {
      setMessage(error.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2 className="auth-title">
          {isLogin ? 'Iniciar sesión' : 'Crea tu cuenta'}
        </h2>

        <div className="auth-subtitle">
          Accede para participar en votaciones
        </div>

        {message && (
          <div className="auth-message">{message}</div>
        )}

        <input
          type="email"
          placeholder="Correo"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* PASSWORD */}
        <div className="input-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Contraseña"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="button"
            className="password-icon"
            onClick={() =>
              setShowPassword(!showPassword)
            }
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

        {/* 🔥 RECUPERAR CONTRASEÑA (SOLO LOGIN) */}
        {isLogin && (
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={resetLoading}
            className="auth-link"
            style={{
              marginTop: '6px',
              display: 'block',
              textAlign: 'right',
              width: '100%',
            }}
          >
            {resetLoading
              ? 'Enviando...'
              : '¿Has olvidado la contraseña?'}
          </button>
        )}

        {!isLogin && (
          <>
            {/* CHECKLIST */}
            <div className="password-checklist">
              <div className={passwordChecks.minLength ? 'valid' : 'invalid'}>
                {passwordChecks.minLength ? '✅' : '⬜'} Mínimo 8 caracteres
              </div>

              <div className={passwordChecks.uppercase ? 'valid' : 'invalid'}>
                {passwordChecks.uppercase ? '✅' : '⬜'} Una mayúscula
              </div>

              <div className={passwordChecks.number ? 'valid' : 'invalid'}>
                {passwordChecks.number ? '✅' : '⬜'} Un número
              </div>

              <div className={passwordChecks.special ? 'valid' : 'invalid'}>
                {passwordChecks.special ? '✅' : '⬜'} Un carácter especial
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirmar contraseña"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                required
              />

              <button
                type="button"
                className="password-icon"
                onClick={() =>
                  setShowConfirmPassword(!showConfirmPassword)
                }
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>

            {/* MATCH MESSAGE */}
            {confirmPassword.length > 0 && !passwordsMatch && (
              <div className="password-error">
                ❌ Las contraseñas no coinciden
              </div>
            )}

            {confirmPassword.length > 0 && passwordsMatch && (
              <div className="password-success">
                ✅ Las contraseñas coinciden
              </div>
            )}

            <input
              type="text"
              placeholder="Nombre de usuario (Username)"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Nombre"
              className="auth-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Apellidos"
              className="auth-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </>
        )}

        <button
          type="submit"
          className="auth-button"
          disabled={loading}
        >
          {loading
            ? 'Procesando...'
            : isLogin
            ? 'Entrar'
            : 'Registrarse'}
        </button>

        <div className="auth-footer">
          {isLogin
            ? '¿No tienes cuenta?'
            : '¿Ya tienes cuenta?'}{' '}
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage('');
              setPassword('');
              setConfirmPassword('');
            }}
          >
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </div>
      </form>
    </div>
  );
}