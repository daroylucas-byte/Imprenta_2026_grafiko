import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Correo electrónico no válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      setAuth(authData.session);
      toast.success('¡Bienvenido de nuevo!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Error al iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-surface min-h-screen flex flex-col items-center justify-center selection:bg-primary-fixed selection:text-on-primary-fixed relative overflow-hidden">
      <main className="flex-grow flex items-center justify-center w-full px-6 py-12">
        <div className="relative w-full max-w-[440px]">
          {/* Decorative Accent Gradient */}
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-primary-container/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-surface-dim/30 rounded-full blur-3xl"></div>

          {/* Login Card */}
          <div className="relative bg-surface-container-lowest p-8 md:p-12 rounded-xl shadow-[0_20px_40px_rgba(11,28,48,0.06)] ring-1 ring-outline-variant/10">
            {/* Branding Header */}
            <div className="flex flex-col items-center mb-10">
              <div className="w-16 h-16 bg-gradient-to-tr from-primary to-primary-container rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined text-on-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>print</span>
              </div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                GestiPrint
              </h1>
              <p className="text-on-surface-variant text-sm mt-2 text-center">Acceso al Centro de Producción</p>
            </div>

            {/* Form Section */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant font-semibold" htmlFor="email">Correo Electrónico</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-xl group-focus-within:text-primary transition-colors">alternate_email</span>
                  </div>
                  <input
                    {...register('email')}
                    className={`block w-full pl-11 bg-surface-container-low border-0 border-b-2 ${errors.email ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 transition-all text-on-surface placeholder:text-outline py-3 rounded-t-lg`}
                    id="email"
                    placeholder="nombre@gestiprint.com"
                    type="email"
                  />
                </div>
                {errors.email && <p className="text-error text-xs">{errors.email.message}</p>}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant font-semibold" htmlFor="password">Contraseña</label>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-xl group-focus-within:text-primary transition-colors">lock</span>
                  </div>
                  <input
                    {...register('password')}
                    className={`block w-full pl-11 pr-11 bg-surface-container-low border-0 border-b-2 ${errors.password ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 transition-all text-on-surface placeholder:text-outline py-3 rounded-t-lg`}
                    id="password"
                    placeholder="••••••••"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {errors.password && <p className="text-error text-xs">{errors.password.message}</p>}
              </div>

              {/* Actions */}
              <div className="pt-2">
                <button
                  disabled={isSubmitting}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                >
                  <span>{isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}</span>
                  {!isSubmitting && <span className="material-symbols-outlined text-xl">arrow_forward</span>}
                </button>
              </div>

              <div className="flex flex-col items-center space-y-4 pt-4">
                <Link to="/register" className="text-sm font-medium text-primary hover:text-primary-container transition-colors">
                  ¿No tienes una cuenta? Regístrate
                </Link>
                <a className="text-sm font-medium text-outline hover:text-on-surface transition-colors" href="#">
                  Olvidé mi contraseña
                </a>
              </div>
            </form>
          </div>

          {/* Optional Help Link */}
          <div className="mt-8 text-center">
            <a className="inline-flex items-center space-x-2 text-on-secondary-fixed-variant hover:text-primary transition-colors" href="#">
              <span className="material-symbols-outlined text-lg">help_outline</span>
              <span className="text-sm font-medium">Centro de Ayuda</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 mt-auto bg-surface-container-low border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center px-8">
        <div className="mb-4 md:mb-0">
          <span className="text-xs font-label uppercase tracking-widest text-outline">© 2024 Precision & Paper. All rights reserved.</span>
        </div>
        <div className="flex space-x-6">
          <a className="text-xs font-label uppercase tracking-widest text-outline hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a className="text-xs font-label uppercase tracking-widest text-outline hover:text-primary transition-colors" href="#">Terms of Service</a>
          <a className="text-xs font-label uppercase tracking-widest text-outline hover:text-primary transition-colors" href="#">Help Center</a>
        </div>
      </footer>

      {/* Aesthetic Backdrop Image */}
      <div className="fixed inset-0 -z-10 opacity-30 pointer-events-none overflow-hidden">
        <img
          className="w-full h-full object-cover blur-[80px]"
          alt=""
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAeCJ56D9M-ZCiRqnIY9EBOAKahG1unNdoq4BE4hqmO93fzElDQVKtcogomNas_uKlZCVYpFWew3ZYyPnCSKPTJNVNemsAex1T5B-M1Fx5GWXAa8drGESY8eo4XaaeF6-OKoBnCJ7nsLodxA27ID7NkILmVUdC2tsYc7o8lPVf-0Pm9Zjn7rcPN1iD2HBjq_0YNMt4Tf0Lg3bTaw7-pM-VTG5Fm00rxlKhvkAaFp5ZrlPJycmS4eHlztDvRIX_uY3-KDAF3_v3Me_0"
        />
      </div>
    </div>
  );
}
